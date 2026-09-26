import { invoke } from "@tauri-apps/api/core";

import type { DocumentEncoding, FileMetadataSnapshot, LineEnding } from "../utils/documentState";

export const MARKDOWN_FILE_EXTENSIONS = ["md", "markdown"] as const;

export type MarkdownFileExtension = `.${(typeof MARKDOWN_FILE_EXTENSIONS)[number]}`;

export const OPEN_MARKDOWN_FILE_COMMAND = "open_markdown_file";
export const SAVE_MARKDOWN_FILE_COMMAND = "save_markdown_file";

export interface OpenMarkdownFileArgs {
  path: string;
}

export interface OpenMarkdownFileResult {
  path: string;
  parentFolderPath: string;
  metadata: FileMetadataSnapshot;
  content: string;
  lineEnding: LineEnding | null;
  encoding: DocumentEncoding;
}

export type OpenMarkdownFileError =
  | { kind: "unsupportedFileType"; path: string }
  | { kind: "invalidPath"; path: string }
  | { kind: "missingFile"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | {
      kind: "oversizedFile";
      path: string;
      sizeBytes: number;
      maxSizeBytes: number;
    }
  | { kind: "invalidEncoding"; path: string }
  | { kind: "readFailed"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string };

export interface SaveMarkdownFileArgs {
  path: string;
  content: string;
  encoding: DocumentEncoding;
  expectedMetadata: FileMetadataSnapshot | null;
  overwrite: boolean;
}

export interface SaveMarkdownFileResult {
  path: string;
  parentFolderPath: string;
  metadata: FileMetadataSnapshot;
}

export type SaveMarkdownFileError =
  | { kind: "unsupportedFileType"; path: string }
  | { kind: "invalidPath"; path: string }
  | { kind: "missingFile"; path: string }
  | { kind: "missingParentFolder"; path: string; parentFolderPath: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | {
      kind: "externalModification";
      path: string;
      currentMetadata: FileMetadataSnapshot;
    }
  | { kind: "writeFailed"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string };

export const openMarkdownFile = ({ path }: OpenMarkdownFileArgs) =>
  invoke<OpenMarkdownFileResult>(OPEN_MARKDOWN_FILE_COMMAND, { path });

export const saveMarkdownFile = ({
  content,
  encoding,
  expectedMetadata,
  overwrite,
  path,
}: SaveMarkdownFileArgs) =>
  invoke<SaveMarkdownFileResult>(SAVE_MARKDOWN_FILE_COMMAND, {
    path,
    content,
    encoding,
    expectedMetadata,
    overwrite,
  });
