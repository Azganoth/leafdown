import {
  inspectMarkdownDocument,
  isInspectMarkdownFileError,
  isOpenMarkdownFileError,
  matchesActiveDocumentKey,
  openMarkdownDocument,
  toSavedDocument,
  type ExternalFileChange,
  type FileMetadataSnapshot,
  type MarkdownFileState,
  type SavedDocumentState,
} from "@/features/document";
import { CancellationToken, isCancellationError } from "@/lib/cancellation";
import { t } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";
import { notifySuccess, notifyWarning } from "@/lib/toast";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { runAfterPendingSaves } from "./documentWorkflows";
import { notifyOpenMarkdownFileError } from "./openSession";

type ExternalVersion = Extract<ExternalFileChange, { kind: "modified" }>;

/**
 * Saves, Save as, and renames replace the file and the document's baseline in one queued task, so
 * a check waiting behind them never compares a file Leafdown just wrote with the baseline before it.
 */
export const checkActiveDocumentFile = (
  cancellationToken: CancellationToken = CancellationToken.None,
) => runAfterPendingSaves(() => checkActiveDocumentFileNow(cancellationToken));

const checkActiveDocumentFileNow = async (cancellationToken: CancellationToken) => {
  const { activeDocument, activeDocumentGeneration } = useSessionStore.getState();

  if (cancellationToken.isCancellationRequested || activeDocument?.status !== "saved") {
    return;
  }

  let fileState: MarkdownFileState;

  try {
    fileState = await inspectMarkdownDocument(activeDocument, cancellationToken);
  } catch (error) {
    // A failed inspection is logged where it happens; the next filesystem event checks again, and
    // Save still verifies the file before writing.
    if (isCancellationError(error) || isInspectMarkdownFileError(error)) {
      return;
    }

    throw error;
  }

  const document = getUnchangedBaseline(activeDocument, activeDocumentGeneration);

  if (!document) {
    return;
  }

  switch (fileState.kind) {
    case "unchanged":
      setFileState(document, document.metadata, null);
      return;
    case "metadataChanged":
      setFileState(document, fileState.metadata, null);
      return;
    case "missing":
      recordMissingFile(document);
      return;
    case "contentChanged": {
      const version: ExternalVersion = {
        kind: "modified",
        metadata: fileState.metadata,
        fingerprint: fileState.fingerprint,
      };

      if (isObservedVersion(document, version)) {
        setFileState(document, document.metadata, version);
        return;
      }

      if (document.isDirty) {
        recordExternalVersion(document, version);
        return;
      }

      await reloadCleanDocument(document, activeDocumentGeneration, version, cancellationToken);
    }
  }
};

const reloadCleanDocument = async (
  document: SavedDocumentState,
  activeDocumentGeneration: number,
  version: ExternalVersion,
  cancellationToken: CancellationToken,
) => {
  let reloaded;

  try {
    reloaded = await openMarkdownDocument(
      document.path,
      cancellationToken,
      document.fileEncoding.name,
    );
  } catch (error) {
    const latestDocument = getUnchangedBaseline(document, activeDocumentGeneration);

    if (isCancellationError(error) || !latestDocument) {
      return;
    }

    if (isOpenMarkdownFileError(error) && error.kind === "missingFile") {
      recordMissingFile(latestDocument);
      return;
    }

    setFileState(latestDocument, latestDocument.metadata, version);
    notifyOpenMarkdownFileError(error);
    return;
  }

  const latestDocument = getUnchangedBaseline(document, activeDocumentGeneration);

  if (!latestDocument) {
    return;
  }

  if (reloaded.fingerprint === latestDocument.fingerprint) {
    setFileState(latestDocument, reloaded.metadata, null);
    return;
  }

  if (latestDocument.isDirty) {
    recordExternalVersion(latestDocument, {
      kind: "modified",
      metadata: reloaded.metadata,
      fingerprint: reloaded.fingerprint,
    });
    return;
  }

  useSessionStore.getState().setActiveDocument(
    toSavedDocument({
      path: latestDocument.path,
      content: reloaded.content,
      lineEnding: reloaded.lineEnding,
      encoding: reloaded.encoding,
      metadata: reloaded.metadata,
      fingerprint: reloaded.fingerprint,
    }),
    { reload: true, viewState: documentEditorBridge.getViewState(latestDocument.path) },
  );
  notifySuccess({
    title: t("session.externalChange.reloaded.title"),
    description: t("session.externalChange.reloaded.description", {
      name: getPathParts(latestDocument.path).name,
    }),
  });
};

/** Returns the active document only while it is still the version the check compared against. */
const getUnchangedBaseline = (document: SavedDocumentState, activeDocumentGeneration: number) => {
  const session = useSessionStore.getState();
  const { activeDocument } = session;

  if (
    session.activeDocumentGeneration !== activeDocumentGeneration ||
    activeDocument?.status !== "saved" ||
    !matchesActiveDocumentKey(activeDocument, document.path) ||
    activeDocument.metadata !== document.metadata ||
    activeDocument.fingerprint !== document.fingerprint
  ) {
    return null;
  }

  return activeDocument;
};

const isObservedVersion = (document: SavedDocumentState, version: ExternalVersion) =>
  document.externalChange?.kind === "modified" &&
  document.externalChange.fingerprint === version.fingerprint;

const setFileState = (
  document: SavedDocumentState,
  metadata: FileMetadataSnapshot,
  externalChange: ExternalFileChange | null,
) => {
  useSessionStore
    .getState()
    .setActiveDocumentFileState(document.path, { metadata, externalChange });
};

const recordExternalVersion = (document: SavedDocumentState, version: ExternalVersion) => {
  setFileState(document, document.metadata, version);
  notifyWarning({
    title: t("session.externalChange.modified.title"),
    description: t("session.externalChange.modified.description", {
      name: getPathParts(document.path).name,
    }),
  });
};

const recordMissingFile = (document: SavedDocumentState) => {
  if (document.externalChange?.kind === "missing") {
    return;
  }

  setFileState(document, document.metadata, { kind: "missing" });
  notifyWarning({
    title: t("session.externalChange.missing.title"),
    description: t("session.externalChange.missing.description", {
      name: getPathParts(document.path).name,
    }),
  });
};
