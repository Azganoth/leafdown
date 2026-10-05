import { invoke } from "@tauri-apps/api/core";

import type { FileMetadataSnapshot, OpenMarkdownFileError } from "@/features/document";

export const READ_FOLDER_SEARCH_FILES_COMMAND = "read_folder_search_files";

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
