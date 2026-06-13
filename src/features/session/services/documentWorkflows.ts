import { documentDir, join } from "@tauri-apps/api/path";
import { confirm as showConfirmDialog } from "@tauri-apps/plugin-dialog";

import {
  ensureMarkdownExtension,
  getActiveDocumentKey,
  isSaveMarkdownFileError,
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
import { useSessionStore } from "../stores/session";
import { confirmActiveDocumentTransition } from "./dirtyDocumentTransitions";
import { getActiveDocumentEditorMarkdown } from "./documentEditorBridge";
import { formatMarkdownForSave } from "@/features/document";

interface SerializedDocumentForSave {
  content: string;
  lineEnding: LineEnding;
}

const untitledBaseName = "Untitled";
let nextUntitledId = 1;

export const createNewMarkdownDocument = async () => {
  if (!(await confirmActiveDocumentTransition())) {
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

  if (!(await confirmActiveDocumentTransition())) {
    return false;
  }

  useSessionStore.getState().setActiveDocument(null);

  return true;
};

export const saveActiveMarkdownDocument = async () => {
  const activeDocument = useSessionStore.getState().activeDocument;

  if (!activeDocument) {
    return false;
  }

  if (activeDocument.status === "untitled") {
    return saveActiveMarkdownDocumentAs();
  }

  return saveSerializedDocumentToSavedPath(
    activeDocument,
    serializeActiveDocumentForSave(activeDocument),
  );
};

export const saveActiveMarkdownDocumentAs = async () => {
  const activeDocument = useSessionStore.getState().activeDocument;

  if (!activeDocument) {
    return false;
  }

  const defaultPath = await getSaveAsDefaultPath(activeDocument);
  const selectedPath = await selectMarkdownSavePath(defaultPath);

  if (!selectedPath) {
    return false;
  }

  const { defaultNewDocumentExtension } = useSettingsStore.getState();
  const path = await ensureMarkdownExtension(selectedPath, defaultNewDocumentExtension);
  const latestDocument = useSessionStore.getState().activeDocument;

  if (!latestDocument) {
    return false;
  }

  const serializedDocument = serializeActiveDocumentForSave(latestDocument);
  const result = await saveMarkdownDocument(path, serializedDocument.content);
  const folderContext = await scanFolderContext(result.parentFolderPath, getFolderScanOptions());

  useSessionStore.getState().setDocumentSession(
    folderContext,
    toSavedDocument({
      path: result.path,
      content: serializedDocument.content,
      lineEnding: serializedDocument.lineEnding,
      metadata: result.metadata,
    }),
  );

  return true;
};

const serializeActiveDocumentForSave = (
  activeDocument: ActiveDocumentState,
): SerializedDocumentForSave => {
  const { defaultNewDocumentLineEnding, insertFinalNewline } = useSettingsStore.getState();
  const lineEnding = activeDocument.lineEnding ?? defaultNewDocumentLineEnding;
  const documentKey = getActiveDocumentKey(activeDocument);
  const markdown = getActiveDocumentEditorMarkdown(documentKey) ?? activeDocument.content;

  return {
    content: formatMarkdownForSave(markdown, lineEnding, insertFinalNewline),
    lineEnding,
  };
};

const saveSerializedDocumentToSavedPath = async (
  activeDocument: SavedDocumentState,
  serializedDocument: SerializedDocumentForSave,
  overwrite = false,
): Promise<boolean> => {
  try {
    const result = await saveMarkdownDocument(activeDocument.path, serializedDocument.content, {
      expectedMetadata: activeDocument.metadata,
      overwrite,
    });

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
      return handleMissingSavedFile();
    }

    if (isExternalModificationSaveError(error)) {
      return handleExternalModification(activeDocument);
    }

    throw error;
  }
};

const handleMissingSavedFile = async () => {
  const shouldSaveAs = await showConfirmDialog(
    "The saved Markdown file no longer exists. Save this document to a new path?",
    {
      title: "File missing",
      kind: "warning",
      okLabel: "Save as",
      cancelLabel: "Cancel",
    },
  );

  return shouldSaveAs ? saveActiveMarkdownDocumentAs() : false;
};

const handleExternalModification = async (activeDocument: SavedDocumentState) => {
  const shouldOverwrite = await showConfirmDialog(
    "The saved Markdown file changed outside Leafdown. Overwrite the file with the current document?",
    {
      title: "File changed",
      kind: "warning",
      okLabel: "Overwrite anyway",
      cancelLabel: "Cancel save",
    },
  );

  if (!shouldOverwrite) {
    return false;
  }

  const latestDocument = useSessionStore.getState().activeDocument;

  if (latestDocument?.status !== "saved" || latestDocument.path !== activeDocument.path) {
    return false;
  }

  return saveSerializedDocumentToSavedPath(
    latestDocument,
    serializeActiveDocumentForSave(latestDocument),
    true,
  );
};

const isMissingFileSaveError = (error: unknown) =>
  isSaveMarkdownFileError(error) && error.kind === "missingFile";

const isExternalModificationSaveError = (error: unknown) =>
  isSaveMarkdownFileError(error) && error.kind === "externalModification";

const getSaveAsDefaultPath = async (activeDocument: ActiveDocumentState) => {
  if (activeDocument.status === "saved") {
    return activeDocument.path;
  }

  const fileName = `${untitledBaseName}${useSettingsStore.getState().defaultNewDocumentExtension}`;
  const folderPath = useSessionStore.getState().folderContext?.path ?? (await documentDir());

  return join(folderPath, fileName);
};

const getFolderScanOptions = () => {
  const { articleSortOrder, ignoredDirectories } = useSettingsStore.getState();

  return { ignoredDirectories, sortOrder: articleSortOrder };
};
