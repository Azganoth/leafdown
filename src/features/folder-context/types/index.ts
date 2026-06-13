import type { FileMetadataSnapshot, LineEnding } from "@/features/document";

export type ArticleSortOrder = "name" | "modifiedDate" | "type";

export interface ArticleTree {
  name: string;
  path: string;
  children: ArticleTreeNode[];
}

export interface ArticleDirectoryNode {
  kind: "directory";
  name: string;
  path: string;
  children: ArticleTreeNode[];
}

export interface ArticleFileNode {
  kind: "file";
  name: string;
  path: string;
}

export type ArticleTreeNode = ArticleDirectoryNode | ArticleFileNode;

export interface FolderContextState {
  path: string;
  tree: ArticleTree;
  isEmpty: boolean;
}

export type FolderContextStatus = "available" | "empty";

export interface FolderContextScanOptions {
  ignoredDirectories: string[];
  sortOrder: ArticleSortOrder;
}

export interface OpenFolderContextOptions extends FolderContextScanOptions {
  indexFileNames: string[];
}

export interface FolderIndexDocument {
  path: string;
  content: string;
  lineEnding: LineEnding | null;
  metadata: FileMetadataSnapshot;
}

export interface OpenedFolderContext {
  folderContext: FolderContextState;
  indexDocument: FolderIndexDocument | null;
}

export const getFolderContextStatus = (folderContext: FolderContextState): FolderContextStatus =>
  folderContext.isEmpty ? "empty" : "available";
