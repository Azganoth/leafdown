import { invoke } from "@tauri-apps/api/core";
import { documentDir, extname, join } from "@tauri-apps/api/path";
import { confirm as showConfirmDialog, save as showSaveDialog } from "@tauri-apps/plugin-dialog";

import { getActiveDocumentEditorMarkdown } from "@/lib/documentEditorBridge";
import { formatMarkdownForSave } from "@/lib/documentSerialization";
import {
  getActiveDocumentKey,
  toSavedDocument,
  toUntitledDocument,
  useSessionStore,
  type ActiveDocumentState,
  type FileMetadataSnapshot,
  type LineEnding,
  type SavedDocumentState,
} from "@/stores/session";
import { useSettingsStore, type DefaultNewDocumentExtension } from "@/stores/settings";
import { scanMarkdownFolder } from "./openMarkdownFolder";

interface SaveMarkdownFileResult {
  path: string;
  parentFolderPath: string;
  metadata: FileMetadataSnapshot;
}

type SaveMarkdownFileError =
  | { kind: "missingFile"; path: string }
  | {
      kind: "externalModification";
      path: string;
      currentMetadata: FileMetadataSnapshot;
    };

interface SerializedDocumentForSave {
  content: string;
  lineEnding: LineEnding;
}

interface WriteMarkdownDocumentOptions {
  expectedMetadata?: FileMetadataSnapshot | null;
  overwrite?: boolean;
}

const markdownFilters = [{ name: "Markdown", extensions: ["md", "markdown"] }];
const untitledBaseName = "Untitled";
let nextUntitledId = 1;

export const ensureDefaultMarkdownExtension = async (
  path: string,
  defaultExtension: DefaultNewDocumentExtension,
) => {
  const extension = await extname(path);

  if (!extension) {
    return `${path}${defaultExtension}`;
  }

  return path;
};

export const createNewMarkdownDocument = () => {
  const { defaultNewDocumentLineEnding } = useSettingsStore.getState();

  useSessionStore.getState().setActiveDocument(
    toUntitledDocument({
      id: `untitled:${nextUntitledId++}`,
      content: "",
      lineEnding: defaultNewDocumentLineEnding,
    }),
  );
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
  const selectedPath = await showSaveDialog({
    title: "Save Markdown document",
    filters: markdownFilters,
    defaultPath,
  });

  if (!selectedPath) {
    return false;
  }

  const { defaultNewDocumentExtension } = useSettingsStore.getState();
  const path = await ensureDefaultMarkdownExtension(selectedPath, defaultNewDocumentExtension);
  const latestDocument = useSessionStore.getState().activeDocument;

  if (!latestDocument) {
    return false;
  }

  const serializedDocument = serializeActiveDocumentForSave(latestDocument);
  const result = await writeMarkdownDocument(path, serializedDocument.content);
  const folderContext = await scanMarkdownFolder(result.parentFolderPath);

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
    const result = await writeMarkdownDocument(activeDocument.path, serializedDocument.content, {
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

const writeMarkdownDocument = async (
  path: string,
  content: string,
  options: WriteMarkdownDocumentOptions = {},
) =>
  invoke<SaveMarkdownFileResult>("save_markdown_file", {
    path,
    content,
    expectedMetadata: options.expectedMetadata ?? null,
    overwrite: options.overwrite ?? false,
  });

const isSaveMarkdownFileError = (error: unknown): error is SaveMarkdownFileError =>
  typeof error === "object" && error !== null && "kind" in error;

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
