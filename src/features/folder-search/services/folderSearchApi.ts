import { invoke } from "@tauri-apps/api/core";

import type {
  DocumentEncoding,
  FileMetadataSnapshot,
  LineEnding,
  OpenMarkdownFileError,
  TextEncodingName,
} from "@/features/document";

export const READ_FOLDER_SEARCH_FILES_COMMAND = "read_folder_search_files";
export const PREFLIGHT_FOLDER_REPLACEMENT_COMMAND = "preflight_folder_replacement";
export const WRITE_FOLDER_REPLACEMENT_FILES_COMMAND = "write_folder_replacement_files";

export interface FolderSearchFileRequest {
  path: string;
  /** The metadata of the version already read, which the backend need not read again. */
  knownMetadata: FileMetadataSnapshot | null;
}

export type FolderSearchFileOutcome =
  | { kind: "unchanged"; path: string }
  | {
      kind: "read";
      path: string;
      content: string;
      lineEnding: LineEnding | null;
      encoding: DocumentEncoding;
      metadata: FileMetadataSnapshot;
      fingerprint: string;
    }
  | { kind: "skipped"; path: string; error: OpenMarkdownFileError }
  | { kind: "notArticle"; path: string };

export type ReadFolderSearchFilesError = { kind: "readFailed"; path: string; message: string };

export interface ReadFolderSearchFilesArgs {
  folderPath: string;
  files: FolderSearchFileRequest[];
}

/** Outcomes for the first files requested, in order; the backend may stop before the last. */
export const readFolderSearchFiles = ({ files, folderPath }: ReadFolderSearchFilesArgs) =>
  invoke<FolderSearchFileOutcome[]>(READ_FOLDER_SEARCH_FILES_COMMAND, { folderPath, files });

/** A file's planned text and the version of the file it was planned against. */
export interface FolderReplacementFile {
  path: string;
  content: string;
  encoding: DocumentEncoding;
  expectedMetadata: FileMetadataSnapshot;
  expectedFingerprint: string;
}

export type FolderReplacementError =
  | { kind: "notArticle" }
  | { kind: "unrepresentableCharacters"; encoding: TextEncodingName; characters: string[] }
  | { kind: "permissionDenied"; message: string }
  | { kind: "readFailed"; message: string }
  | { kind: "writeFailed"; message: string };

export type FolderReplacementOutcome =
  | { kind: "ready"; path: string }
  | { kind: "written"; path: string }
  | { kind: "stale"; path: string; missing: boolean }
  | { kind: "failed"; path: string; error: FolderReplacementError };

export interface FolderReplacementArgs {
  folderPath: string;
  files: FolderReplacementFile[];
}

/** Checks planned files without writing; outcomes for the first files requested, in order. */
export const preflightFolderReplacement = ({ files, folderPath }: FolderReplacementArgs) =>
  invoke<FolderReplacementOutcome[]>(PREFLIGHT_FOLDER_REPLACEMENT_COMMAND, { folderPath, files });

/** Writes planned files, each checked again just before it is written; outcomes for the first files. */
export const writeFolderReplacementFiles = ({ files, folderPath }: FolderReplacementArgs) =>
  invoke<FolderReplacementOutcome[]>(WRITE_FOLDER_REPLACEMENT_FILES_COMMAND, {
    folderPath,
    files,
  });
