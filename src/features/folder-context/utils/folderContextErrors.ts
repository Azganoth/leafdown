import {
  getOpenMarkdownFileErrorMessage,
  type DocumentIoErrorMessage,
  type OpenMarkdownFileError,
} from "@/features/document";

type ScanFolderContextError =
  | { kind: "metadataFailed"; path: string; message: string }
  | { kind: "notDirectory"; path: string }
  | { kind: "readDirectoryFailed"; path: string; message: string }
  | { kind: "directoryEntryFailed"; path: string; message: string };

type OpenFolderContextError =
  | { kind: "scanFailed"; error: ScanFolderContextError }
  | { kind: "indexOpenFailed"; error: OpenMarkdownFileError };

const fallbackOpenFolderError: DocumentIoErrorMessage = {
  title: "Could not open folder.",
};

export const getOpenFolderContextErrorMessage = (
  error: unknown,
  fallback = fallbackOpenFolderError,
): DocumentIoErrorMessage => {
  if (!isOpenFolderContextError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "scanFailed":
      return isScanFolderContextError(error.error)
        ? getScanFolderContextErrorMessage(error.error)
        : fallback;
    case "indexOpenFailed": {
      if (!isOpenMarkdownFileError(error.error)) {
        return fallback;
      }

      const indexError = getOpenMarkdownFileErrorMessage(error.error);

      return {
        title: "Could not open folder index file.",
        description: indexError.description ?? indexError.title,
      };
    }
  }
};

const getScanFolderContextErrorMessage = (
  error: ScanFolderContextError,
): DocumentIoErrorMessage => {
  switch (error.kind) {
    case "metadataFailed":
      return { title: "Could not inspect folder.", description: error.message || error.path };
    case "notDirectory":
      return { title: "Folder path is not a directory.", description: error.path };
    case "readDirectoryFailed":
      return { title: "Could not read folder.", description: error.message || error.path };
    case "directoryEntryFailed":
      return { title: "Could not scan folder entry.", description: error.message || error.path };
  }
};

const isOpenMarkdownFileError = (error: unknown): error is OpenMarkdownFileError =>
  isTaggedObject(error) && openMarkdownFileErrorKinds.has(error.kind);

const isOpenFolderContextError = (error: unknown): error is OpenFolderContextError =>
  isTaggedObject(error) && openFolderContextErrorKinds.has(error.kind);

const isScanFolderContextError = (error: unknown): error is ScanFolderContextError =>
  isTaggedObject(error) && scanFolderContextErrorKinds.has(error.kind);

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

const scanFolderContextErrorKinds = new Set([
  "metadataFailed",
  "notDirectory",
  "readDirectoryFailed",
  "directoryEntryFailed",
]);

const openFolderContextErrorKinds = new Set(["scanFailed", "indexOpenFailed"]);

const isTaggedObject = (error: unknown): error is { kind: string } =>
  typeof error === "object" && error !== null && "kind" in error && typeof error.kind === "string";
