import type { MessageData } from "@/lib/messages";
import { isTaggedPayload } from "@/lib/taggedPayload";

import type {
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
