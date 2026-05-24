import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import {
  toSavedDocument,
  useSessionStore,
  type FileMetadataSnapshot,
  type FolderContextState,
  type LineEnding,
  type MarkdownFolderTree,
} from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";

interface MarkdownFolderScanResult {
  path: string;
  tree: MarkdownFolderTree;
  isEmpty: boolean;
}

interface OpenMarkdownFolderDocument {
  path: string;
  content: string;
  lineEnding: LineEnding | null;
  metadata: FileMetadataSnapshot;
}

interface OpenMarkdownFolderResult {
  folder: MarkdownFolderScanResult;
  indexDocument: OpenMarkdownFolderDocument | null;
}

const toFolderContext = (folder: MarkdownFolderScanResult): FolderContextState => ({
  path: folder.path,
  tree: folder.tree,
});

export const scanMarkdownFolder = async (path: string) => {
  const { fileTreeSortOrder, ignoredDirectories } = useSettingsStore.getState();
  const folder = await invoke<MarkdownFolderScanResult>("scan_markdown_folder", {
    path,
    ignoredDirectories,
    sortOrder: fileTreeSortOrder,
  });

  return toFolderContext(folder);
};

export const openMarkdownFolder = async () => {
  const selectedPath = await open({
    directory: true,
    multiple: false,
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return;
  }

  const { fileTreeSortOrder, ignoredDirectories, indexFileNames } = useSettingsStore.getState();
  const openedFolder = await invoke<OpenMarkdownFolderResult>("open_markdown_folder", {
    path: selectedPath,
    ignoredDirectories,
    indexFileNames,
    sortOrder: fileTreeSortOrder,
  });
  const folderContext = toFolderContext(openedFolder.folder);

  if (!openedFolder.indexDocument) {
    useSessionStore.getState().setFolderSession(folderContext);
    return;
  }

  useSessionStore
    .getState()
    .setDocumentSession(folderContext, toSavedDocument(openedFolder.indexDocument));
};
