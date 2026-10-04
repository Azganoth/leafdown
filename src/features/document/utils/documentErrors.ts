import { formatFileSize } from "@/lib/formatFileSize";
import { localizer, t } from "@/lib/i18n";
import type { MessageData } from "@/lib/messages";
import { isTaggedPayload } from "@/lib/taggedPayload";

import type {
  InspectMarkdownFileError,
  OpenMarkdownFileError,
  SaveMarkdownFileError,
  WatchMarkdownDocumentError,
  WriteHtmlExportError,
} from "../services/markdownDocumentApi";
import { formatEncodingName } from "./documentEncoding";

export type {
  InspectMarkdownFileError,
  OpenMarkdownFileError,
  SaveMarkdownFileError,
  WatchMarkdownDocumentError,
  WriteHtmlExportError,
} from "../services/markdownDocumentApi";

const OPEN_MARKDOWN_FILE_ERROR_KINDS = [
  "unsupportedFileType",
  "invalidPath",
  "missingFile",
  "permissionDenied",
  "oversizedFile",
  "invalidEncoding",
  "irreversibleEncoding",
  "readFailed",
  "metadataFailed",
] as const satisfies readonly OpenMarkdownFileError["kind"][];

export const getOpenMarkdownFileErrorMessage = (
  error: unknown,
  fallback: MessageData = { title: t("document.openError.fallback") },
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
        title: t("document.openError.invalidPath"),
        description: error.path,
      };
    case "missingFile":
      return {
        title: t("document.openError.missingFile"),
        description: error.path,
      };
    case "permissionDenied":
      return {
        title: t("document.openError.permissionDenied"),
        description: error.message ?? error.path,
      };
    case "oversizedFile":
      return {
        title: t("document.openError.oversizedFile.title"),
        description: t("document.openError.oversizedFile.description", {
          size: formatFileSize(error.sizeBytes, localizer.current),
          maxSize: formatFileSize(error.maxSizeBytes, localizer.current),
        }),
      };
    case "invalidEncoding":
      return {
        title: t("document.openError.invalidEncoding.title"),
        description: t("document.openError.invalidEncoding.description"),
      };
    case "irreversibleEncoding":
      return {
        title: t("document.openError.irreversibleEncoding.title", {
          encoding: formatEncodingName(error.encoding),
        }),
        description: t("document.openError.irreversibleEncoding.description"),
      };
    case "readFailed":
      return {
        title: t("document.openError.readFailed"),
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: t("document.openError.metadataFailed"),
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
  "unrepresentableCharacters",
  "writeFailed",
  "metadataFailed",
] as const satisfies readonly SaveMarkdownFileError["kind"][];

export const getSaveMarkdownFileErrorMessage = (
  error: unknown,
  fallback: MessageData = { title: t("document.saveError.fallback") },
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
        title: t("document.saveError.invalidPath"),
        description: error.path,
      };
    case "missingFile":
      return {
        title: t("document.saveError.missingFile"),
        description: error.path,
      };
    case "missingParentFolder":
      return {
        title: t("document.saveError.missingParentFolder"),
        description: error.parentFolderPath,
      };
    case "permissionDenied":
      return {
        title: t("document.saveError.permissionDenied"),
        description: error.message ?? error.path,
      };
    case "externalModification":
      return {
        title: t("document.saveError.externalModification"),
        description: error.path,
      };
    case "unrepresentableCharacters":
      return {
        title: t("document.saveError.unrepresentableCharacters", {
          encoding: formatEncodingName(error.encoding),
        }),
        description: formatUnrepresentableCharacters(error.characters),
      };
    case "writeFailed":
      return {
        title: t("document.saveError.writeFailed"),
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: t("document.saveError.metadataFailed"),
        description: error.message ?? error.path,
      };
  }
};

export const isSaveMarkdownFileError = (error: unknown): error is SaveMarkdownFileError =>
  isTaggedPayload(error, SAVE_MARKDOWN_FILE_ERROR_KINDS);

const WRITE_HTML_EXPORT_ERROR_KINDS = [
  "unsupportedFileType",
  "sourceDocument",
  "invalidPath",
  "missingParentFolder",
  "permissionDenied",
  "writeFailed",
] as const satisfies readonly WriteHtmlExportError["kind"][];

export const isWriteHtmlExportError = (error: unknown): error is WriteHtmlExportError =>
  isTaggedPayload(error, WRITE_HTML_EXPORT_ERROR_KINDS);

export const getWriteHtmlExportErrorMessage = (
  error: unknown,
  fallback: MessageData = { title: t("document.exportError.fallback") },
): MessageData => {
  if (!isWriteHtmlExportError(error)) {
    return fallback;
  }

  switch (error.kind) {
    case "unsupportedFileType":
      return {
        title: t("document.exportError.unsupportedFileType.title"),
        description: t("document.exportError.unsupportedFileType.description"),
      };
    case "sourceDocument":
      return { title: t("document.exportError.sourceDocument"), description: error.path };
    case "invalidPath":
      return { title: t("document.exportError.invalidPath"), description: error.path };
    case "missingParentFolder":
      return {
        title: t("document.exportError.missingParentFolder"),
        description: error.parentFolderPath,
      };
    case "permissionDenied":
      return {
        title: t("document.exportError.permissionDenied"),
        description: error.message || error.path,
      };
    case "writeFailed":
      return {
        title: t("document.exportError.writeFailed"),
        description: error.message || error.path,
      };
  }
};

const INSPECT_MARKDOWN_FILE_ERROR_KINDS = [
  "unsupportedFileType",
  "invalidPath",
  "permissionDenied",
  "readFailed",
  "metadataFailed",
] as const satisfies readonly InspectMarkdownFileError["kind"][];

export const isInspectMarkdownFileError = (error: unknown): error is InspectMarkdownFileError =>
  isTaggedPayload(error, INSPECT_MARKDOWN_FILE_ERROR_KINDS);

const WATCH_MARKDOWN_DOCUMENT_ERROR_KINDS = [
  "unsupportedFileType",
  "invalidPath",
  "watchFailed",
  "watcherStateFailed",
] as const satisfies readonly WatchMarkdownDocumentError["kind"][];

export const isWatchMarkdownDocumentError = (error: unknown): error is WatchMarkdownDocumentError =>
  isTaggedPayload(error, WATCH_MARKDOWN_DOCUMENT_ERROR_KINDS);

export type UnrepresentableCharactersError = Extract<
  SaveMarkdownFileError,
  { kind: "unrepresentableCharacters" }
>;

export const isUnrepresentableCharactersError = (
  error: unknown,
): error is UnrepresentableCharactersError =>
  isSaveMarkdownFileError(error) && error.kind === "unrepresentableCharacters";

export const isEncodingOpenError = (
  error: unknown,
): error is Extract<OpenMarkdownFileError, { kind: "invalidEncoding" | "irreversibleEncoding" }> =>
  isOpenMarkdownFileError(error) &&
  (error.kind === "invalidEncoding" || error.kind === "irreversibleEncoding");

const MAX_LISTED_UNREPRESENTABLE_CHARACTERS = 12;

const formatCodePoint = (character: string) =>
  `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;

export const formatUnrepresentableCharacters = (characters: readonly string[]) => {
  const listed = characters
    .slice(0, MAX_LISTED_UNREPRESENTABLE_CHARACTERS)
    .map((character) => `${character} (${formatCodePoint(character)})`);
  const remaining = characters.length - listed.length;

  return remaining > 0
    ? t("document.unrepresentableCharacters.truncated", {
        characters: localizer.current.formatList(listed, "unit"),
        remaining,
      })
    : localizer.current.formatList(listed, "unit");
};
