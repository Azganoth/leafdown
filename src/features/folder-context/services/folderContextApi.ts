import { invoke } from "@tauri-apps/api/core";

import type { FileMetadataSnapshot, LineEnding, OpenMarkdownFileError } from "@/features/document";

export const SCAN_MARKDOWN_FOLDER_COMMAND = "scan_markdown_folder";
export const OPEN_MARKDOWN_FOLDER_COMMAND = "open_markdown_folder";
export const WATCH_MARKDOWN_FOLDER_COMMAND = "watch_markdown_folder";
export const UNWATCH_MARKDOWN_FOLDER_COMMAND = "unwatch_markdown_folder";

export const FOLDER_CONTEXT_CHANGED_EVENT = "leafdown://folder-changed";

export const FOLDER_CONTEXT_WATCH_ERROR_EVENT = "leafdown://folder-watch-error";

export const ARTICLE_SORT_ORDERS = ["name", "modifiedDate", "type"] as const;
export type ArticleSortOrder = (typeof ARTICLE_SORT_ORDERS)[number];

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

export interface ScanMarkdownFolderResult {
  path: string;
  tree: ArticleTree;
  isEmpty: boolean;
  warnings: ScanMarkdownFolderWarning[];
}

export type ScanMarkdownFolderError =
  | { kind: "invalidPath"; path: string }
  | { kind: "missingFolder"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string }
  | { kind: "notDirectory"; path: string }
  | { kind: "readDirectoryFailed"; path: string; message: string };

export type ScanMarkdownFolderWarning =
  | { kind: "invalidPath"; path: string }
  | { kind: "missingFolder"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string }
  | { kind: "readDirectoryFailed"; path: string; message: string }
  | { kind: "directoryEntryFailed"; path: string; message: string };

export interface OpenMarkdownFolderArgs extends ScanMarkdownFolderArgs {
  indexFileNames: string[];
}

export interface OpenMarkdownFolderResult {
  folder: ScanMarkdownFolderResult;
  indexDocument: FolderIndexDocument | null;
  indexError: OpenMarkdownFileError | null;
}

export type OpenMarkdownFolderError = { kind: "scanFailed"; error: ScanMarkdownFolderError };

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

export type WatchMarkdownFolderError =
  | { kind: "invalidPath"; path: string }
  | { kind: "missingFolder"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string }
  | { kind: "notDirectory"; path: string }
  | { kind: "watchFailed"; path: string; message: string }
  | { kind: "watcherStateFailed"; message: string };

export interface FolderContextChangedEventPayload {
  folderPath: string;
  paths: string[];
}

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
