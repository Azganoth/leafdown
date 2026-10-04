import { invoke } from "@tauri-apps/api/core";

import type { DocumentEncoding, TextEncodingName } from "../utils/documentEncoding";
import type { FileMetadataSnapshot, LineEnding } from "../utils/documentState";

export const MARKDOWN_FILE_EXTENSIONS = ["md", "markdown"] as const;

export type MarkdownFileExtension = `.${(typeof MARKDOWN_FILE_EXTENSIONS)[number]}`;

export const OPEN_MARKDOWN_FILE_COMMAND = "open_markdown_file";
export const SAVE_MARKDOWN_FILE_COMMAND = "save_markdown_file";
export const INSPECT_MARKDOWN_FILE_COMMAND = "inspect_markdown_file";
export const WATCH_MARKDOWN_DOCUMENT_COMMAND = "watch_markdown_document";
export const UNWATCH_MARKDOWN_DOCUMENT_COMMAND = "unwatch_markdown_document";
export const WRITE_HTML_EXPORT_COMMAND = "write_html_export";
export const MARKDOWN_DOCUMENT_CHANGED_EVENT = "leafdown://document-changed";

export interface OpenMarkdownFileArgs {
  path: string;
  encoding?: TextEncodingName | null;
}

export interface OpenMarkdownFileResult {
  path: string;
  parentFolderPath: string;
  metadata: FileMetadataSnapshot;
  content: string;
  lineEnding: LineEnding | null;
  encoding: DocumentEncoding;
  fingerprint: string;
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
  | { kind: "irreversibleEncoding"; path: string; encoding: TextEncodingName }
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
  fingerprint: string;
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
  | {
      kind: "unrepresentableCharacters";
      path: string;
      encoding: TextEncodingName;
      characters: string[];
    }
  | { kind: "writeFailed"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string };

export interface WriteHtmlExportArgs {
  path: string;
  content: string;
  sourceDocumentPath: string | null;
}

export type WriteHtmlExportError =
  | { kind: "unsupportedFileType"; path: string }
  | { kind: "sourceDocument"; path: string }
  | { kind: "invalidPath"; path: string }
  | { kind: "missingParentFolder"; path: string; parentFolderPath: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "writeFailed"; path: string; message: string };

export interface InspectMarkdownFileArgs {
  path: string;
  metadata: FileMetadataSnapshot;
  fingerprint: string;
}

export type MarkdownFileState =
  | { kind: "unchanged" }
  | { kind: "metadataChanged"; metadata: FileMetadataSnapshot }
  | { kind: "contentChanged"; metadata: FileMetadataSnapshot; fingerprint: string }
  | { kind: "missing" };

export type InspectMarkdownFileError =
  | { kind: "unsupportedFileType"; path: string }
  | { kind: "invalidPath"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | { kind: "readFailed"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string };

export interface WatchMarkdownDocumentArgs {
  path: string;
  scopeId: string;
  scopeGeneration: number;
}

export interface UnwatchMarkdownDocumentArgs {
  scopeId: string;
  scopeGeneration: number;
}

export interface MarkdownDocumentChangedEventPayload {
  path: string;
}

export type WatchMarkdownDocumentError =
  | { kind: "unsupportedFileType"; path: string }
  | { kind: "invalidPath"; path: string }
  | { kind: "watchFailed"; path: string; message: string }
  | { kind: "watcherStateFailed"; message: string };

export const openMarkdownFile = ({ encoding = null, path }: OpenMarkdownFileArgs) =>
  invoke<OpenMarkdownFileResult>(OPEN_MARKDOWN_FILE_COMMAND, { path, encoding });

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

export const inspectMarkdownFile = ({ fingerprint, metadata, path }: InspectMarkdownFileArgs) =>
  invoke<MarkdownFileState>(INSPECT_MARKDOWN_FILE_COMMAND, { path, metadata, fingerprint });

export const watchMarkdownDocument = ({
  path,
  scopeGeneration,
  scopeId,
}: WatchMarkdownDocumentArgs) =>
  invoke<void>(WATCH_MARKDOWN_DOCUMENT_COMMAND, { path, scopeId, scopeGeneration });

export const unwatchMarkdownDocument = ({
  scopeGeneration,
  scopeId,
}: UnwatchMarkdownDocumentArgs) =>
  invoke<void>(UNWATCH_MARKDOWN_DOCUMENT_COMMAND, { scopeId, scopeGeneration });

export const writeHtmlExport = ({ content, path, sourceDocumentPath }: WriteHtmlExportArgs) =>
  invoke<void>(WRITE_HTML_EXPORT_COMMAND, { path, content, sourceDocumentPath });
