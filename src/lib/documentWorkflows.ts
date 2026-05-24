import { invoke } from "@tauri-apps/api/core";
import { documentDir, extname, join } from "@tauri-apps/api/path";
import { save as showSaveDialog } from "@tauri-apps/plugin-dialog";

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
} from "@/stores/session";
import { useSettingsStore, type DefaultNewDocumentExtension } from "@/stores/settings";
import { scanMarkdownFolder } from "./openMarkdownFolder";

interface SaveMarkdownFileResult {
  path: string;
  parentFolderPath: string;
  metadata: FileMetadataSnapshot;
}

interface SerializedDocumentForSave {
  content: string;
  lineEnding: LineEnding;
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

  const serializedDocument = serializeActiveDocumentForSave(activeDocument);
  const result = await writeMarkdownDocument(activeDocument.path, serializedDocument.content);

  useSessionStore.getState().setActiveDocument(
    toSavedDocument({
      path: result.path,
      content: serializedDocument.content,
      lineEnding: serializedDocument.lineEnding,
      metadata: result.metadata,
    }),
  );

  return true;
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

const writeMarkdownDocument = async (path: string, content: string) =>
  invoke<SaveMarkdownFileResult>("save_markdown_file", { path, content });

const getSaveAsDefaultPath = async (activeDocument: ActiveDocumentState) => {
  if (activeDocument.status === "saved") {
    return activeDocument.path;
  }

  const fileName = `${untitledBaseName}${useSettingsStore.getState().defaultNewDocumentExtension}`;
  const folderPath = useSessionStore.getState().folderContext?.path ?? (await documentDir());

  return join(folderPath, fileName);
};
