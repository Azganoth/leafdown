import type { FileMetadataSnapshot } from "../types";

export interface DocumentIoErrorMessage {
  title: string;
  description?: string;
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

export type SaveMarkdownFileError =
  | { kind: "unsupportedFileType"; path: string }
  | { kind: "invalidPath"; path: string }
  | { kind: "missingFile"; path: string }
  | { kind: "permissionDenied"; path: string; message: string }
  | {
      kind: "externalModification";
      path: string;
      currentMetadata: FileMetadataSnapshot;
    }
  | { kind: "writeFailed"; path: string; message: string }
  | { kind: "metadataFailed"; path: string; message: string };

const fallbackOpenFileError: DocumentIoErrorMessage = {
  title: "Could not open Markdown file.",
};

const fallbackSaveError: DocumentIoErrorMessage = {
  title: "Could not save Markdown document.",
};

export const getOpenMarkdownFileErrorMessage = (
  error: unknown,
  fallback = fallbackOpenFileError,
): DocumentIoErrorMessage => {
  if (!isOpenMarkdownFileError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "unsupportedFileType":
      return {
        title: "Unsupported Markdown file type.",
        description: "Leafdown opens .md and .markdown files.",
      };
    case "invalidPath":
      return {
        title: "Invalid Markdown file path.",
        description: error.path,
      };
    case "missingFile":
      return {
        title: "Markdown file not found.",
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: "Permission denied opening Markdown file.",
        description: error.message || error.path,
      };
    case "oversizedFile":
      return {
        title: "Markdown file is too large.",
        description: `${formatFileSize(error.sizeBytes)} selected. Files larger than ${formatFileSize(
          error.maxSizeBytes,
        )} do not load.`,
      };
    case "invalidEncoding":
      return {
        title: "Invalid Markdown file encoding.",
        description: "Leafdown opens Markdown files encoded as UTF-8.",
      };
    case "readFailed":
      return {
        title: "Could not read Markdown file.",
        description: error.message || error.path,
      };
    case "metadataFailed":
      return {
        title: "Could not inspect Markdown file.",
        description: error.message || error.path,
      };
  }
};

export const getSaveMarkdownFileErrorMessage = (
  error: unknown,
  fallback = fallbackSaveError,
): DocumentIoErrorMessage => {
  if (!isSaveMarkdownFileError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "unsupportedFileType":
      return {
        title: "Unsupported save file type.",
        description: "Save Markdown documents as .md or .markdown files.",
      };
    case "invalidPath":
      return {
        title: "Invalid save path.",
        description: error.path,
      };
    case "missingFile":
      return {
        title: "Saved Markdown file is missing.",
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: "Permission denied saving Markdown file.",
        description: error.message || error.path,
      };
    case "externalModification":
      return {
        title: "Markdown file changed outside Leafdown.",
        description: error.path,
      };
    case "writeFailed":
      return {
        title: "Could not write Markdown file.",
        description: error.message || error.path,
      };
    case "metadataFailed":
      return {
        title: "Could not inspect saved Markdown file.",
        description: error.message || error.path,
      };
  }
};

export const isSaveMarkdownFileError = (error: unknown): error is SaveMarkdownFileError =>
  isTaggedObject(error) && saveMarkdownFileErrorKinds.has(error.kind);

export const showDocumentIoErrorToast = (
  showError: (title: string, options?: { description?: string }) => void,
  message: DocumentIoErrorMessage,
) => {
  if (message.description) {
    showError(message.title, { description: message.description });
    return;
  }

  showError(message.title);
};

const isOpenMarkdownFileError = (error: unknown): error is OpenMarkdownFileError =>
  isTaggedObject(error) && openMarkdownFileErrorKinds.has(error.kind);

const openMarkdownFileErrorKinds = new Set([
  "unsupportedFileType",
  "invalidPath",
  "missingFile",
  "permissionDenied",
  "oversizedFile",
  "invalidEncoding",
  "readFailed",
  "metadataFailed",
]);

const saveMarkdownFileErrorKinds = new Set([
  "unsupportedFileType",
  "invalidPath",
  "missingFile",
  "permissionDenied",
  "externalModification",
  "writeFailed",
  "metadataFailed",
]);

const isTaggedObject = (error: unknown): error is { kind: string } =>
  isRecord(error) && "kind" in error && typeof error.kind === "string";

const isRecord = (error: unknown): error is Record<string, unknown> =>
  typeof error === "object" && error !== null;

const formatFileSize = (sizeBytes: number) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "unknown size";
  }

  const sizeMegabytes = sizeBytes / (1024 * 1024);

  if (sizeMegabytes >= 1) {
    const formattedSize = Number.isInteger(sizeMegabytes)
      ? sizeMegabytes.toString()
      : sizeMegabytes.toFixed(1);

    return `${formattedSize} MB`;
  }

  return `${sizeBytes} bytes`;
};
