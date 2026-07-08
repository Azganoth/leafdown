import { formatFileSize } from "@/lib/formatFileSize";
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

const FALLBACK_OPEN_FILE_ERROR: MessageData = {
  title: "Could not open Markdown file.",
};

export const getOpenMarkdownFileErrorMessage = (
  error: unknown,
  fallback: MessageData = FALLBACK_OPEN_FILE_ERROR,
): MessageData => {
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
        description: error.message ?? error.path,
      };
    case "oversizedFile":
      return {
        title: "Markdown file is too large.",
        description: `${formatFileSize(error.sizeBytes)} selected. Files larger than ${formatFileSize(error.maxSizeBytes)} do not load.`,
      };
    case "invalidEncoding":
      return {
        title: "Invalid Markdown file encoding.",
        description: "Leafdown opens Markdown files encoded as UTF-8.",
      };
    case "readFailed":
      return {
        title: "Could not read Markdown file.",
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: "Could not inspect Markdown file.",
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

const FALLBACK_SAVE_ERROR: MessageData = {
  title: "Could not save Markdown document.",
};

export const getSaveMarkdownFileErrorMessage = (
  error: unknown,
  fallback: MessageData = FALLBACK_SAVE_ERROR,
): MessageData => {
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
    case "missingParentFolder":
      return {
        title: "Save folder not found.",
        description: error.parentFolderPath,
      };
    case "permissionDenied":
      return {
        title: "Permission denied saving Markdown file.",
        description: error.message ?? error.path,
      };
    case "externalModification":
      return {
        title: "Markdown file changed outside Leafdown.",
        description: error.path,
      };
    case "writeFailed":
      return {
        title: "Could not write Markdown file.",
        description: error.message ?? error.path,
      };
    case "metadataFailed":
      return {
        title: "Could not inspect saved Markdown file.",
        description: error.message ?? error.path,
      };
  }
};

export const isSaveMarkdownFileError = (error: unknown): error is SaveMarkdownFileError =>
  isTaggedPayload(error, SAVE_MARKDOWN_FILE_ERROR_KINDS);
