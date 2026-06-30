import { invoke } from "@tauri-apps/api/core";

import type { FileMetadataSnapshot, LineEnding, OpenMarkdownFileError } from "@/features/document";

export const SCAN_MARKDOWN_FOLDER_COMMAND = "scan_markdown_folder";
export const OPEN_MARKDOWN_FOLDER_COMMAND = "open_markdown_folder";
export const WATCH_MARKDOWN_FOLDER_COMMAND = "watch_markdown_folder";
export const UNWATCH_MARKDOWN_FOLDER_COMMAND = "unwatch_markdown_folder";

/* NOTE: src-tauri/src/folder/watch.rs (FOLDER_CHANGED_EVENT). */
export const FOLDER_CONTEXT_CHANGED_EVENT = "leafdown://folder-changed";

/* NOTE: src-tauri/src/folder/watch.rs (FOLDER_WATCH_ERROR_EVENT). */
export const FOLDER_CONTEXT_WATCH_ERROR_EVENT = "leafdown://folder-watch-error";

/* NOTE: src-tauri/src/folder.rs (FileTreeSortOrder). */
export type ArticleSortOrder = "name" | "modifiedDate" | "type";

/* NOTE: src-tauri/src/folder.rs (MarkdownFolderTree). */
export interface ArticleTree {
  name: string;
  path: string;
  children: ArticleTreeNode[];
}

/* NOTE: src-tauri/src/folder.rs (MarkdownFolderTreeNode::Directory). */
export interface ArticleDirectoryNode {
  kind: "directory";
  name: string;
  path: string;
  children: ArticleTreeNode[];
}

/* NOTE: src-tauri/src/folder.rs (MarkdownFolderTreeNode::File). */
export interface ArticleFileNode {
  kind: "file";
  name: string;
  path: string;
}

/* NOTE: src-tauri/src/folder.rs (MarkdownFolderTreeNode). */
export type ArticleTreeNode = ArticleDirectoryNode | ArticleFileNode;

/* NOTE: src-tauri/src/document.rs (OpenMarkdownFileResult). */
export interface FolderIndexDocument {
  path: string;
  content: string;
  lineEnding: LineEnding | null;
  metadata: FileMetadataSnapshot;
}

export interface ScanMarkdownFolderArgs {
  path: string;
  ignoredDirectories: string[];
  sortOrder: ArticleSortOrder;
}

/* NOTE: src-tauri/src/folder.rs (MarkdownFolderScanResult). */
export interface ScanMarkdownFolderResult {
  path: string;
  tree: ArticleTree;
  isEmpty: boolean;
}

/* NOTE: src-tauri/src/folder.rs (ScanMarkdownFolderError). */
export type ScanMarkdownFolderError =
  | { kind: "invalidPath"; path: string }
  | { kind: "missingFolder"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string }
  | { kind: "notDirectory"; path: string }
  | { kind: "readDirectoryFailed"; path: string; message: string }
  | { kind: "directoryEntryFailed"; path: string; message: string };

export interface OpenMarkdownFolderArgs extends ScanMarkdownFolderArgs {
  indexFileNames: string[];
}

/* NOTE: src-tauri/src/folder.rs (OpenMarkdownFolderResult). */
export interface OpenMarkdownFolderResult {
  folder: ScanMarkdownFolderResult;
  indexDocument: FolderIndexDocument | null;
}

/* NOTE: src-tauri/src/folder.rs (OpenMarkdownFolderError). */
export type OpenMarkdownFolderError =
  | { kind: "scanFailed"; error: ScanMarkdownFolderError }
  | { kind: "indexOpenFailed"; error: OpenMarkdownFileError };

export interface WatchMarkdownFolderArgs {
  path: string;
  ignoredDirectories: string[];
  scopeId: string;
  scopeGeneration: number;
}

export interface UnwatchMarkdownFolderArgs {
  scopeId: string;
  scopeGeneration: number;
}

/* NOTE: src-tauri/src/folder/watch.rs (WatchMarkdownFolderError). */
export type WatchMarkdownFolderError =
  | { kind: "invalidPath"; path: string }
  | { kind: "missingFolder"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string }
  | { kind: "notDirectory"; path: string }
  | { kind: "watchFailed"; path: string; message: string }
  | { kind: "watcherStateFailed"; message: string };

/* NOTE: src-tauri/src/folder/watch.rs (MarkdownFolderChangedEvent). */
export interface FolderContextChangedEventPayload {
  folderPath: string;
  paths: string[];
}

/* NOTE: src-tauri/src/folder/watch.rs (MarkdownFolderWatchErrorEvent). */
export interface FolderContextWatchErrorEventPayload {
  folderPath: string;
  error: WatchMarkdownFolderError;
}

export const scanMarkdownFolder = ({
  ignoredDirectories,
  path,
  sortOrder,
}: ScanMarkdownFolderArgs) =>
  invoke<ScanMarkdownFolderResult>(SCAN_MARKDOWN_FOLDER_COMMAND, {
    path,
    ignoredDirectories,
    sortOrder,
  });

export const openMarkdownFolder = ({
  ignoredDirectories,
  indexFileNames,
  path,
  sortOrder,
}: OpenMarkdownFolderArgs) =>
  invoke<OpenMarkdownFolderResult>(OPEN_MARKDOWN_FOLDER_COMMAND, {
    path,
    ignoredDirectories,
    indexFileNames,
    sortOrder,
  });

export const watchMarkdownFolder = ({
  ignoredDirectories,
  path,
  scopeGeneration,
  scopeId,
}: WatchMarkdownFolderArgs) =>
  invoke<void>(WATCH_MARKDOWN_FOLDER_COMMAND, {
    path,
    ignoredDirectories,
    scopeId,
    scopeGeneration,
  });

export const unwatchMarkdownFolder = ({ scopeGeneration, scopeId }: UnwatchMarkdownFolderArgs) =>
  invoke<void>(UNWATCH_MARKDOWN_FOLDER_COMMAND, {
    scopeId,
    scopeGeneration,
  });
