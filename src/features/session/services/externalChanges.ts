import {
  inspectMarkdownDocument,
  isInspectMarkdownFileError,
  isOpenMarkdownFileError,
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
import { notifySuccess } from "@/lib/toast";

import { findCurrentTab, findTabByPath, useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { notifyOpenMarkdownFileError } from "./documentOpenWorkflows";
import { runAfterPendingSaves } from "./documentWorkflows";

type ExternalVersion = Extract<ExternalFileChange, { kind: "modified" }>;

interface CheckedDocument {
  tabId: string;
  generation: number;
  document: SavedDocumentState;
}

/**
 * Compares the file of an open document with the version the document holds. Saves, Save as, and
 * renames replace the file and the document's baseline in one queued task, so a check waiting
 * behind them never compares a file Leafdown just wrote with the baseline before it.
 */
export const checkDocumentFile = (
  path: string,
  cancellationToken: CancellationToken = CancellationToken.None,
) => runAfterPendingSaves(() => checkDocumentFileNow(path, cancellationToken));

const checkDocumentFileNow = async (path: string, cancellationToken: CancellationToken) => {
  const tab = findTabByPath(useSessionStore.getState(), path);

  if (cancellationToken.isCancellationRequested || tab?.document.status !== "saved") {
    return;
  }

  const checked: CheckedDocument = {
    tabId: tab.id,
    generation: tab.generation,
    document: tab.document,
  };
  let fileState: MarkdownFileState;

  try {
    fileState = await inspectMarkdownDocument(checked.document, cancellationToken);
  } catch (error) {
    // A failed inspection is logged where it happens; the next filesystem event checks again, and
    // Save still verifies the file before writing.
    if (isCancellationError(error) || isInspectMarkdownFileError(error)) {
      return;
    }

    throw error;
  }

  const document = getUnchangedBaseline(checked);

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

      await reloadCleanDocument(checked, version, cancellationToken);
    }
  }
};

const reloadCleanDocument = async (
  checked: CheckedDocument,
  version: ExternalVersion,
  cancellationToken: CancellationToken,
) => {
  const { document } = checked;
  let reloaded;

  try {
    reloaded = await openMarkdownDocument(
      document.path,
      cancellationToken,
      document.fileEncoding.name,
    );
  } catch (error) {
    const latestDocument = getUnchangedBaseline(checked);

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

  const latestDocument = getUnchangedBaseline(checked);

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

  useSessionStore.getState().replaceTabDocument(
    checked.tabId,
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

/** Returns the tab's document only while it is still the version the check compared against. */
const getUnchangedBaseline = ({ document, generation, tabId }: CheckedDocument) => {
  const latestDocument = findCurrentTab(useSessionStore.getState(), tabId, generation)?.document;

  if (
    latestDocument?.status !== "saved" ||
    latestDocument.metadata !== document.metadata ||
    latestDocument.fingerprint !== document.fingerprint
  ) {
    return null;
  }

  return latestDocument;
};

const isObservedVersion = (document: SavedDocumentState, version: ExternalVersion) =>
  document.externalChange?.kind === "modified" &&
  document.externalChange.fingerprint === version.fingerprint;

const setFileState = (
  document: SavedDocumentState,
  metadata: FileMetadataSnapshot,
  externalChange: ExternalFileChange | null,
) => {
  useSessionStore.getState().setDocumentFileState(document.path, { metadata, externalChange });
};

const recordExternalVersion = (document: SavedDocumentState, version: ExternalVersion) => {
  setFileState(document, document.metadata, version);
};

const recordMissingFile = (document: SavedDocumentState) => {
  if (document.externalChange?.kind === "missing") {
    return;
  }

  setFileState(document, document.metadata, { kind: "missing" });
};
