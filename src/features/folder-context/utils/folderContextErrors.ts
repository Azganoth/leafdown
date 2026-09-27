import { t, type MessageId } from "@/lib/i18n";
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

export const getScanFolderContextErrorMessage = (
  error: unknown,
  fallback: MessageData = { title: t("folderContext.scanError.fallback") },
): MessageData => {
  if (!isScanFolderContextError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "invalidPath":
      return {
        title: t("folderContext.scanError.invalidPath"),
        description: error.path,
      };
    case "missingFolder":
      return {
        title: t("folderContext.scanError.missingFolder"),
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: t("folderContext.scanError.permissionDenied"),
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: t("folderContext.scanError.metadataFailed"),
        description: error.message ?? error.path,
      };
    case "notDirectory":
      return {
        title: t("folderContext.scanError.notDirectory"),
        description: error.path,
      };
    case "readDirectoryFailed":
      return {
        title: t("folderContext.scanError.readDirectoryFailed"),
        description: error.message ?? error.path,
      };
  }
};

export const isScanFolderContextError = (error: unknown): error is ScanFolderContextError =>
  isTaggedPayload(error, SCAN_FOLDER_CONTEXT_ERROR_KINDS);

const OPEN_FOLDER_CONTEXT_ERROR_KINDS = [
  "scanFailed",
] as const satisfies readonly OpenFolderContextError["kind"][];

export const getOpenFolderContextErrorMessage = (
  error: unknown,
  fallback: MessageData = { title: t("folderContext.openError.fallback") },
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

export const getWatchFolderContextErrorMessage = (
  error: unknown,
  fallback: MessageData = { title: t("folderContext.watchError.fallback") },
): MessageData => {
  if (!isWatchFolderContextError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "invalidPath":
      return {
        title: t("folderContext.watchError.invalidPath"),
        description: error.path,
      };
    case "missingFolder":
      return {
        title: t("folderContext.watchError.missingFolder"),
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: t("folderContext.watchError.permissionDenied"),
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: t("folderContext.watchError.metadataFailed"),
        description: error.message ?? error.path,
      };
    case "notDirectory":
      return {
        title: t("folderContext.watchError.notDirectory"),
        description: error.path,
      };
    case "watchFailed":
      return {
        title: t("folderContext.watchError.watchFailed"),
        description: error.message ?? error.path,
      };
    case "watcherStateFailed":
      return {
        title: t("folderContext.watchError.watchFailed"),
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

const INVALID_FOLDER_ENTRY_NAME_DESCRIPTION_IDS = {
  empty: "folderContext.entryError.invalidName.empty",
  reservedName: "folderContext.entryError.invalidName.reservedName",
  invalidCharacter: "folderContext.entryError.invalidName.invalidCharacter",
  trailingDotOrSpace: "folderContext.entryError.invalidName.trailingDotOrSpace",
} as const satisfies Record<InvalidFolderEntryNameReason, MessageId>;

export const getFolderEntryErrorMessage = (error: unknown, fallback: MessageData): MessageData => {
  if (!isFolderEntryError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "invalidName":
      return {
        title: t("folderContext.entryError.invalidName"),
        description: t(INVALID_FOLDER_ENTRY_NAME_DESCRIPTION_IDS[error.reason]),
      };
    case "unsupportedExtension":
      return {
        title: t("folderContext.entryError.unsupportedExtension.title"),
        description: t("folderContext.entryError.unsupportedExtension.description"),
      };
    case "alreadyExists":
      return {
        title: t("folderContext.entryError.alreadyExists"),
        description: error.path,
      };
    case "outsideFolder":
      return {
        title: t("folderContext.entryError.outsideFolder"),
        description: error.path,
      };
    case "invalidPath":
      return {
        title: t("folderContext.entryError.invalidPath"),
        description: error.path,
      };
    case "missingEntry":
      return {
        title: t("folderContext.entryError.missingEntry"),
        description: error.path,
      };
    case "notDirectory":
      return {
        title: t("folderContext.entryError.notDirectory"),
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: t("folderContext.entryError.permissionDenied"),
        description: error.message || error.path,
      };
    case "operationFailed":
      return {
        ...fallback,
        description: error.message || error.path,
      };
    case "trashFailed":
      return {
        title: t("folderContext.entryError.trashFailed"),
        description: error.message || error.path,
      };
  }
};

export const isFolderEntryError = (error: unknown): error is FolderEntryError =>
  isTaggedPayload(error, FOLDER_ENTRY_ERROR_KINDS);
