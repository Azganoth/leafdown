import { open } from "@tauri-apps/plugin-dialog";

import { CancellationToken, raceWithCancellation } from "@/lib/cancellation";

import {
  openMarkdownFolder,
  scanMarkdownFolder,
  type ArticleSortOrder,
  type ArticleTree,
  type FolderIndexDocument,
  type ScanMarkdownFolderResult,
} from "./folderContextApi";

export interface FolderContextState {
  path: string;
  tree: ArticleTree;
  isEmpty: boolean;
}

export interface FolderContextScanOptions {
  ignoredDirectories: string[];
  sortOrder: ArticleSortOrder;
}

export interface OpenFolderContextOptions extends FolderContextScanOptions {
  indexFileNames: string[];
}

export interface OpenedFolderContext {
  folderContext: FolderContextState;
  indexDocument: FolderIndexDocument | null;
}

export type {
  ArticleSortOrder,
  ArticleTree,
  ArticleTreeNode,
  FolderIndexDocument,
} from "./folderContextApi";

const toFolderContext = (folder: ScanMarkdownFolderResult): FolderContextState => ({
  path: folder.path,
  tree: folder.tree,
  isEmpty: folder.isEmpty,
});

export const selectFolderContextPath = async () => {
  const selectedPath = await open({
    directory: true,
    multiple: false,
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return null;
  }

  return selectedPath;
};

export const scanFolderContext = async (
  path: string,
  { ignoredDirectories, sortOrder }: FolderContextScanOptions,
  cancellationToken: CancellationToken = CancellationToken.None,
) => {
  const folder = await raceWithCancellation(cancellationToken, () =>
    scanMarkdownFolder({
      path,
      ignoredDirectories,
      sortOrder,
    }),
  );

  return toFolderContext(folder);
};

export const openFolderContext = async (
  path: string,
  { ignoredDirectories, indexFileNames, sortOrder }: OpenFolderContextOptions,
  cancellationToken: CancellationToken = CancellationToken.None,
): Promise<OpenedFolderContext> => {
  const result = await raceWithCancellation(cancellationToken, () =>
    openMarkdownFolder({
      path,
      ignoredDirectories,
      indexFileNames,
      sortOrder,
    }),
  );

  return {
    folderContext: toFolderContext(result.folder),
    indexDocument: result.indexDocument,
  };
};
