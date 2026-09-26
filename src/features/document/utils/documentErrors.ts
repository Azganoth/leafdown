import { formatFileSize } from "@/lib/formatFileSize";
import { t } from "@/lib/i18n/localizer";
import type { MessageData } from "@/lib/messages";
import { isTaggedPayload } from "@/lib/taggedPayload";

import type { OpenMarkdownFileError, SaveMarkdownFileError } from "../services/markdownDocumentApi";

export type { OpenMarkdownFileError, SaveMarkdownFileError } from "../services/markdownDocumentApi";

const OPEN_MARKDOWN_FILE_ERROR_KINDS = [
  "unsupportedFileType",
  "invalidPath",
  "missingFile",
  "permissionDenied",
  "oversizedFile",
  "invalidEncoding",
  "readFailed",
  "metadataFailed",
] as const satisfies readonly OpenMarkdownFileError["kind"][];

const FALLBACK_OPEN_FILE_ERROR = (): MessageData => ({
  title: t("document.openError.fallback"),
});

export const getOpenMarkdownFileErrorMessage = (
  error: unknown,
  fallback: MessageData = FALLBACK_OPEN_FILE_ERROR(),
): MessageData => {
  if (!isOpenMarkdownFileError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "unsupportedFileType":
      return {
        title: t("document.openError.unsupportedFileType.title"),
        description: t("document.openError.unsupportedFileType.description"),
      };
    case "invalidPath":
      return {
        title: t("document.openError.invalidPath.title"),
        description: error.path,
      };
    case "missingFile":
      return {
        title: t("document.openError.missingFile.title"),
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: t("document.openError.permissionDenied.title"),
        description: error.message ?? error.path,
      };
    case "oversizedFile":
      return {
        title: t("document.openError.oversizedFile.title"),
        description: t("document.openError.oversizedFile.description", {
          size: formatFileSize(error.sizeBytes),
          maxSize: formatFileSize(error.maxSizeBytes),
        }),
      };
    case "invalidEncoding":
      return {
        title: t("document.openError.invalidEncoding.title"),
        description: t("document.openError.invalidEncoding.description"),
      };
    case "readFailed":
      return {
        title: t("document.openError.readFailed.title"),
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: t("document.openError.metadataFailed.title"),
        description: error.message ?? error.path,
      };
  }
};

export const isOpenMarkdownFileError = (error: unknown): error is OpenMarkdownFileError =>
  isTaggedPayload(error, OPEN_MARKDOWN_FILE_ERROR_KINDS);

const SAVE_MARKDOWN_FILE_ERROR_KINDS = [
  "unsupportedFileType",
  "invalidPath",
  "missingFile",
  "missingParentFolder",
  "permissionDenied",
  "externalModification",
  "writeFailed",
  "metadataFailed",
] as const satisfies readonly SaveMarkdownFileError["kind"][];

const FALLBACK_SAVE_ERROR = (): MessageData => ({
  title: t("document.saveError.fallback"),
});

export const getSaveMarkdownFileErrorMessage = (
  error: unknown,
  fallback: MessageData = FALLBACK_SAVE_ERROR(),
): MessageData => {
  if (!isSaveMarkdownFileError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "unsupportedFileType":
      return {
        title: t("document.saveError.unsupportedFileType.title"),
        description: t("document.saveError.unsupportedFileType.description"),
      };
    case "invalidPath":
      return {
        title: t("document.saveError.invalidPath.title"),
        description: error.path,
      };
    case "missingFile":
      return {
        title: t("document.saveError.missingFile.title"),
        description: error.path,
      };
    case "missingParentFolder":
      return {
        title: t("document.saveError.missingParentFolder.title"),
        description: error.parentFolderPath,
      };
    case "permissionDenied":
      return {
        title: t("document.saveError.permissionDenied.title"),
        description: error.message ?? error.path,
      };
    case "externalModification":
      return {
        title: t("document.saveError.externalModification.title"),
        description: error.path,
      };
    case "writeFailed":
      return {
        title: t("document.saveError.writeFailed.title"),
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: t("document.saveError.metadataFailed.title"),
        description: error.message ?? error.path,
      };
  }
};

export const isSaveMarkdownFileError = (error: unknown): error is SaveMarkdownFileError =>
  isTaggedPayload(error, SAVE_MARKDOWN_FILE_ERROR_KINDS);
