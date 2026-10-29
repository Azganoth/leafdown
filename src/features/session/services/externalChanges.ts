import {
  getActiveDocumentKey,
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
import type { EditorViewState } from "@/features/editor";
import { CancellationToken, isCancellationError } from "@/lib/cancellation";
import { getPathIdentityKey } from "@/lib/path";

import {
  findCurrentTab,
  findTabByPath,
  useSessionStore,
  type DocumentTab,
} from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { notifyOpenMarkdownFileError } from "./documentOpenWorkflows";
import { runAfterPendingSaves } from "./documentWorkflows";

interface CheckedDocument {
  tabId: string;
  generation: number;
  document: SavedDocumentState;
}

export const getExternalChangeKey = ({ id, generation, document }: DocumentTab) => {
  if (document.status !== "saved" || !document.externalChange) return null;
  const change = document.externalChange;
  return JSON.stringify([
    id,
    generation,
    getPathIdentityKey(document.path),
    change.kind,
    change.kind === "modified" ? change.fingerprint : null,
  ]);
};

export const getDocumentText = ({ document }: DocumentTab) =>
  document.status === "saved"
    ? (documentEditorBridge.getMarkdown(document.path) ?? document.content)
    : document.content;

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
    case "contentChanged":
      setFileState(document, document.metadata, {
        kind: "modified",
        metadata: fileState.metadata,
        fingerprint: fileState.fingerprint,
      });
  }
};

export const reloadExternalDocument = (
  tab: DocumentTab,
  expectedText: string,
  viewState = documentEditorBridge.getViewState(getActiveDocumentKey(tab.document)),
) => runAfterPendingSaves(() => reloadExternalDocumentNow(tab, expectedText, viewState));

const reloadExternalDocumentNow = async (
  tab: DocumentTab,
  expectedText: string,
  viewState: EditorViewState | null,
) => {
  const { document } = tab;
  if (document.status !== "saved" || document.externalChange?.kind !== "modified") return false;

  const currentDocument = () => {
    const current = findCurrentTab(useSessionStore.getState(), tab.id, tab.generation);
    return current?.document.status === "saved" &&
      getExternalChangeKey(current) === getExternalChangeKey(tab) &&
      getDocumentText(current) === expectedText &&
      current.document.isDirty === document.isDirty
      ? current.document
      : null;
  };
  if (!currentDocument()) return false;
  let reloaded;

  try {
    reloaded = await openMarkdownDocument(
      document.path,
      CancellationToken.None,
      document.fileEncoding.name,
    );
  } catch (error) {
    const latestDocument = currentDocument();

    if (isCancellationError(error) || !latestDocument) {
      return false;
    }

    if (isOpenMarkdownFileError(error) && error.kind === "missingFile") {
      recordMissingFile(latestDocument);
      return false;
    }

    notifyOpenMarkdownFileError(error);
    return false;
  }

  const latestDocument = currentDocument();

  if (!latestDocument) {
    return false;
  }

  if (reloaded.fingerprint === latestDocument.fingerprint) {
    setFileState(latestDocument, reloaded.metadata, null);
    return true;
  }

  if (reloaded.fingerprint !== document.externalChange.fingerprint) {
    setFileState(latestDocument, latestDocument.metadata, {
      kind: "modified",
      metadata: reloaded.metadata,
      fingerprint: reloaded.fingerprint,
    });
    return false;
  }

  useSessionStore.getState().replaceTabDocument(
    tab.id,
    toSavedDocument({
      path: latestDocument.path,
      content: reloaded.content,
      lineEnding: reloaded.lineEnding,
      encoding: reloaded.encoding,
      metadata: reloaded.metadata,
      fingerprint: reloaded.fingerprint,
    }),
    { reload: true, viewState },
  );
  return true;
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

const setFileState = (
  document: SavedDocumentState,
  metadata: FileMetadataSnapshot,
  externalChange: ExternalFileChange | null,
) => {
  useSessionStore.getState().setDocumentFileState(document.path, { metadata, externalChange });
};

const recordMissingFile = (document: SavedDocumentState) => {
  if (document.externalChange?.kind === "missing") {
    return;
  }

  setFileState(document, document.metadata, { kind: "missing" });
};
