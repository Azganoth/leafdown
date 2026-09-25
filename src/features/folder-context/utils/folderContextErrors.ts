import type { MessageData } from "@/lib/messages";
import { isTaggedPayload } from "@/lib/taggedPayload";

import type {
  FolderEntryApiError,
  InvalidFolderEntryNameReason,
  OpenMarkdownFolderError,
  ScanMarkdownFolderError,
  WatchMarkdownFolderError,
} from "../services/folderContextApi";

export type ScanFolderContextError = ScanMarkdownFolderError;
export type OpenFolderContextError = OpenMarkdownFolderError;
export type WatchFolderContextError = WatchMarkdownFolderError;

const SCAN_FOLDER_CONTEXT_ERROR_KINDS = [
  "invalidPath",
  "missingFolder",
  "permissionDenied",
  "metadataFailed",
  "notDirectory",
  "readDirectoryFailed",
] as const satisfies readonly ScanFolderContextError["kind"][];

const FALLBACK_SCAN_FOLDER_ERROR: MessageData = {
  title: "Could not scan folder.",
};

export const getScanFolderContextErrorMessage = (
  error: unknown,
  fallback: MessageData = FALLBACK_SCAN_FOLDER_ERROR,
): MessageData => {
  if (!isScanFolderContextError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "invalidPath":
      return {
        title: "Invalid folder path.",
        description: error.path,
      };
    case "missingFolder":
      return {
        title: "Folder not found.",
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: "Permission denied accessing folder.",
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: "Could not inspect folder.",
        description: error.message ?? error.path,
      };
    case "notDirectory":
      return {
        title: "Folder path is not a directory.",
        description: error.path,
      };
    case "readDirectoryFailed":
      return {
        title: "Could not read folder.",
        description: error.message ?? error.path,
      };
  }
};

export const isScanFolderContextError = (error: unknown): error is ScanFolderContextError =>
  isTaggedPayload(error, SCAN_FOLDER_CONTEXT_ERROR_KINDS);

const OPEN_FOLDER_CONTEXT_ERROR_KINDS = [
  "scanFailed",
] as const satisfies readonly OpenFolderContextError["kind"][];

const FALLBACK_OPEN_FOLDER_ERROR: MessageData = {
  title: "Could not open folder.",
};

export const getOpenFolderContextErrorMessage = (
  error: unknown,
  fallback: MessageData = FALLBACK_OPEN_FOLDER_ERROR,
): MessageData => {
  if (!isOpenFolderContextError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "scanFailed":
      return getScanFolderContextErrorMessage(error.error, fallback);
  }
};

export const isOpenFolderContextError = (error: unknown): error is OpenFolderContextError =>
  isTaggedPayload(error, OPEN_FOLDER_CONTEXT_ERROR_KINDS);

const WATCH_FOLDER_CONTEXT_ERROR_KINDS = [
  "invalidPath",
  "missingFolder",
  "permissionDenied",
  "metadataFailed",
  "notDirectory",
  "watchFailed",
  "watcherStateFailed",
] as const satisfies readonly WatchFolderContextError["kind"][];

const FALLBACK_WATCH_FOLDER_ERROR: MessageData = {
  title: "Could not watch folder.",
};

export const getWatchFolderContextErrorMessage = (
  error: unknown,
  fallback: MessageData = FALLBACK_WATCH_FOLDER_ERROR,
): MessageData => {
  if (!isWatchFolderContextError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "invalidPath":
      return {
        title: "Invalid folder path.",
        description: error.path,
      };
    case "missingFolder":
      return {
        title: "Folder not found.",
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: "Permission denied watching folder.",
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: "Could not inspect folder.",
        description: error.message ?? error.path,
      };
    case "notDirectory":
      return {
        title: "Folder path is not a directory.",
        description: error.path,
      };
    case "watchFailed":
      return {
        title: "Could not watch folder.",
        description: error.message ?? error.path,
      };
    case "watcherStateFailed":
      return {
        title: "Could not watch folder.",
        description: error.message,
      };
  }
};

export const isWatchFolderContextError = (error: unknown): error is WatchFolderContextError =>
  isTaggedPayload(error, WATCH_FOLDER_CONTEXT_ERROR_KINDS);

export type FolderEntryError = FolderEntryApiError;

const FOLDER_ENTRY_ERROR_KINDS = [
  "invalidName",
  "unsupportedExtension",
  "alreadyExists",
  "outsideFolder",
  "invalidPath",
  "missingEntry",
  "notDirectory",
  "permissionDenied",
  "operationFailed",
  "trashFailed",
] as const satisfies readonly FolderEntryError["kind"][];

const INVALID_FOLDER_ENTRY_NAME_DESCRIPTIONS: Record<InvalidFolderEntryNameReason, string> = {
  empty: "Enter a name.",
  reservedName: "The name is reserved by the file system.",
  invalidCharacter: "The name contains a character file names cannot hold.",
  trailingDotOrSpace: "The name cannot end with a period or space.",
};

export const getFolderEntryErrorMessage = (error: unknown, fallback: MessageData): MessageData => {
  if (!isFolderEntryError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "invalidName":
      return {
        title: "Invalid name.",
        description: INVALID_FOLDER_ENTRY_NAME_DESCRIPTIONS[error.reason],
      };
    case "unsupportedExtension":
      return {
        title: "Unsupported file type.",
        description: "Use a .md or .markdown extension, or leave the extension out.",
      };
    case "alreadyExists":
      return {
        title: "An item with that name already exists.",
        description: error.path,
      };
    case "outsideFolder":
      return {
        title: "The item is not inside the current folder.",
        description: error.path,
      };
    case "invalidPath":
      return {
        title: "Invalid path.",
        description: error.path,
      };
    case "missingEntry":
      return {
        title: "The item no longer exists.",
        description: error.path,
      };
    case "notDirectory":
      return {
        title: "The target is not a folder.",
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: "Permission denied.",
        description: error.message || error.path,
      };
    case "operationFailed":
      return {
        ...fallback,
        description: error.message || error.path,
      };
    case "trashFailed":
      return {
        title: "Could not move the item to the trash.",
        description: error.message || error.path,
      };
  }
};

export const isFolderEntryError = (error: unknown): error is FolderEntryError =>
  isTaggedPayload(error, FOLDER_ENTRY_ERROR_KINDS);
