import { documentDir, join } from "@tauri-apps/api/path";

import {
  ensureMarkdownExtension,
  formatMarkdownForSave,
  getActiveDocumentKey,
  isSaveMarkdownFileError,
  matchesActiveDocumentKey,
  saveMarkdownDocument,
  selectMarkdownSavePath,
  toSavedDocument,
  toUntitledDocument,
  type ActiveDocumentState,
  type LineEnding,
  type SavedDocumentState,
} from "@/features/document";
import { scanFolderContext } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { SequentialTaskQueue } from "@/lib/async";
import { requestConfirmation } from "@/lib/confirmation";
import { isSameOrParentPath } from "@/lib/path";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { getSessionFolderScanOptions } from "./folderContextWorkflows";
import { confirmDiscardActiveDocumentChanges } from "./unsavedChanges";

interface SerializedDocumentForSave {
  content: string;
  lineEnding: LineEnding;
}

const UNTITLED_BASE_NAME = "Untitled";
const saveTaskQueue = new SequentialTaskQueue();
let nextUntitledId = 1;

export const resetDocumentWorkflowIdsForTests = () => {
  nextUntitledId = 1;
};

export const createNewMarkdownDocument = async () => {
  if (!(await confirmDiscardActiveDocumentChanges())) {
    return false;
  }

  const { defaultNewDocumentLineEnding } = useSettingsStore.getState();

  useSessionStore.getState().setActiveDocument(
    toUntitledDocument({
      id: `untitled:${nextUntitledId++}`,
      content: "",
      lineEnding: defaultNewDocumentLineEnding,
    }),
  );

  return true;
};

export const closeActiveMarkdownDocument = async () => {
  if (!useSessionStore.getState().activeDocument) {
    return false;
  }

  if (!(await confirmDiscardActiveDocumentChanges())) {
    return false;
  }

  useSessionStore.getState().setActiveDocument(null);

  return true;
};

export const runAfterPendingSaves = <T>(task: () => Promise<T>) => saveTaskQueue.run(task);

export const saveActiveMarkdownDocument = () => saveTaskQueue.run(saveActiveMarkdownDocumentNow);

export const saveActiveMarkdownDocumentAs = () =>
  saveTaskQueue.run(saveActiveMarkdownDocumentAsNow);

const saveActiveMarkdownDocumentNow = async () => {
  const { activeDocument, activeDocumentGeneration } = useSessionStore.getState();

  if (!activeDocument) {
    return false;
  }

  if (activeDocument.status === "untitled") {
    return saveActiveMarkdownDocumentAsNow();
  }

  return saveExistingMarkdownDocument(
    activeDocument,
    serializeActiveDocumentForSave(activeDocument),
    activeDocumentGeneration,
  );
};

const saveActiveMarkdownDocumentAsNow = async () => {
  const { activeDocument, activeDocumentGeneration } = useSessionStore.getState();

  if (!activeDocument) {
    return false;
  }

  const documentKey = getActiveDocumentKey(activeDocument);
  const defaultPath = await getSaveAsDefaultPath(activeDocument);
  const selectedPath = await selectMarkdownSavePath(defaultPath);

  if (!selectedPath) {
    return false;
  }

  const { defaultNewDocumentExtension } = useSettingsStore.getState();
  const path = await ensureMarkdownExtension(selectedPath, defaultNewDocumentExtension);
  const latestDocument = getActiveDocumentByKey(documentKey, activeDocumentGeneration);

  if (!latestDocument) {
    return false;
  }

  const serializedDocument = serializeActiveDocumentForSave(latestDocument);
  const result = await saveMarkdownDocument(path, serializedDocument.content);
  const existingFolderContext = useSessionStore.getState().folderContext;
  const nextFolderContext = await getFolderContextAfterSaveAs(
    result.path,
    result.parentFolderPath,
    existingFolderContext,
  );

  if (!getActiveDocumentByKey(documentKey, activeDocumentGeneration)) {
    return false;
  }

  const savedDocument = toSavedDocument({
    path: result.path,
    content: serializedDocument.content,
    lineEnding: serializedDocument.lineEnding,
    metadata: result.metadata,
  });

  if (nextFolderContext) {
    useSessionStore.getState().setActiveDocumentSession(nextFolderContext, savedDocument);
  } else {
    useSessionStore.getState().setActiveDocument(savedDocument);
  }

  return true;
};

const serializeActiveDocumentForSave = (
  activeDocument: ActiveDocumentState,
): SerializedDocumentForSave => {
  const { defaultNewDocumentLineEnding, insertFinalNewline } = useSettingsStore.getState();
  const lineEnding = activeDocument.lineEnding ?? defaultNewDocumentLineEnding;
  const documentKey = getActiveDocumentKey(activeDocument);
  const markdown = documentEditorBridge.getMarkdown(documentKey) ?? activeDocument.content;

  return {
    content: formatMarkdownForSave(markdown, lineEnding, insertFinalNewline),
    lineEnding,
  };
};

const saveExistingMarkdownDocument = async (
  activeDocument: SavedDocumentState,
  serializedDocument: SerializedDocumentForSave,
  activeDocumentGeneration: number,
  overwrite = false,
): Promise<boolean> => {
  try {
    const result = await saveMarkdownDocument(activeDocument.path, serializedDocument.content, {
      expectedMetadata: activeDocument.metadata,
      overwrite,
    });

    if (!getActiveDocumentByKey(getActiveDocumentKey(activeDocument), activeDocumentGeneration)) {
      return false;
    }

    useSessionStore.getState().setActiveDocument(
      toSavedDocument({
        path: result.path,
        content: serializedDocument.content,
        lineEnding: serializedDocument.lineEnding,
        metadata: result.metadata,
      }),
    );

    return true;
  } catch (error) {
    if (isMissingFileSaveError(error)) {
      if (!getActiveDocumentByKey(getActiveDocumentKey(activeDocument), activeDocumentGeneration)) {
        return false;
      }

      return handleMissingSavedFile(getActiveDocumentKey(activeDocument), activeDocumentGeneration);
    }

    if (isExternalModificationSaveError(error)) {
      if (!getActiveDocumentByKey(getActiveDocumentKey(activeDocument), activeDocumentGeneration)) {
        return false;
      }

      return handleExternalModification(activeDocument, activeDocumentGeneration);
    }

    throw error;
  }
};

const handleMissingSavedFile = async (documentKey: string, activeDocumentGeneration: number) => {
  const shouldSaveAs = await requestConfirmation({
    title: "File missing",
    message: "The saved Markdown file no longer exists. Save this document to a new path?",
    confirmLabel: "Save as",
    cancelLabel: "Cancel",
  });

  if (!getActiveDocumentByKey(documentKey, activeDocumentGeneration)) {
    return false;
  }

  if (!shouldSaveAs) {
    return false;
  }

  return saveActiveMarkdownDocumentAsNow();
};

const handleExternalModification = async (
  activeDocument: SavedDocumentState,
  activeDocumentGeneration: number,
) => {
  const shouldOverwrite = await requestConfirmation({
    title: "File changed",
    message:
      "The saved Markdown file changed outside Leafdown. Overwrite the file with the current document?",
    confirmLabel: "Overwrite anyway",
    cancelLabel: "Cancel save",
  });

  if (!shouldOverwrite) {
    return false;
  }

  const latestDocument = getActiveDocumentByKey(activeDocument.path, activeDocumentGeneration);

  if (
    latestDocument?.status !== "saved" ||
    !matchesActiveDocumentKey(latestDocument, activeDocument.path)
  ) {
    return false;
  }

  return saveExistingMarkdownDocument(
    latestDocument,
    serializeActiveDocumentForSave(latestDocument),
    activeDocumentGeneration,
    true,
  );
};

const isMissingFileSaveError = (error: unknown) =>
  isSaveMarkdownFileError(error) && error.kind === "missingFile";

const isExternalModificationSaveError = (error: unknown) =>
  isSaveMarkdownFileError(error) && error.kind === "externalModification";

const getActiveDocumentByKey = (documentKey: string, activeDocumentGeneration: number) => {
  const session = useSessionStore.getState();
  const activeDocument = session.activeDocument;

  if (
    !activeDocument ||
    session.activeDocumentGeneration !== activeDocumentGeneration ||
    !matchesActiveDocumentKey(activeDocument, documentKey)
  ) {
    return null;
  }

  return activeDocument;
};

const getSaveAsDefaultPath = async (activeDocument: ActiveDocumentState) => {
  if (activeDocument.status === "saved") {
    return activeDocument.path;
  }

  const fileName = `${UNTITLED_BASE_NAME}${useSettingsStore.getState().defaultNewDocumentExtension}`;
  const folderPath = useSessionStore.getState().folderContext?.path ?? (await documentDir());

  return join(folderPath, fileName);
};

const getFolderContextAfterSaveAs = async (
  savedFilePath: string,
  savedParentFolderPath: string,
  existingFolderContext: ReturnType<typeof useSessionStore.getState>["folderContext"],
) => {
  if (!existingFolderContext) {
    return scanFolderContext(savedParentFolderPath, getSessionFolderScanOptions());
  }

  if (isSameOrParentPath(existingFolderContext.path, savedFilePath)) {
    return scanFolderContext(existingFolderContext.path, getSessionFolderScanOptions());
  }

  return null;
};
