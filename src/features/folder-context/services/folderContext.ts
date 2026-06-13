import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import type {
  ArticleTree,
  FolderContextScanOptions,
  FolderContextState,
  FolderIndexDocument,
  OpenedFolderContext,
  OpenFolderContextOptions,
} from "../types";

interface FolderContextScanResult {
  path: string;
  tree: ArticleTree;
  isEmpty: boolean;
}

interface OpenFolderContextResult {
  folder: FolderContextScanResult;
  indexDocument: FolderIndexDocument | null;
}

const toFolderContext = (folder: FolderContextScanResult): FolderContextState => ({
  path: folder.path,
  tree: folder.tree,
  isEmpty: folder.isEmpty,
});

export const selectFolderContextPath = async () => {
  const selectedPath = await open({
    directory: true,
    multiple: false,
  });

  return selectedPath && !Array.isArray(selectedPath) ? selectedPath : null;
};

export const scanFolderContext = async (
  path: string,
  { ignoredDirectories, sortOrder }: FolderContextScanOptions,
) => {
  const folder = await invoke<FolderContextScanResult>("scan_markdown_folder", {
    path,
    ignoredDirectories,
    sortOrder,
  });

  return toFolderContext(folder);
};

export const openFolderContext = async (
  path: string,
  { ignoredDirectories, indexFileNames, sortOrder }: OpenFolderContextOptions,
): Promise<OpenedFolderContext> => {
  const result = await invoke<OpenFolderContextResult>("open_markdown_folder", {
    path,
    ignoredDirectories,
    indexFileNames,
    sortOrder,
  });

  return {
    folderContext: toFolderContext(result.folder),
    indexDocument: result.indexDocument,
  };
};
