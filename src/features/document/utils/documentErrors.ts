import { formatFileSize } from "@/lib/formatFileSize";
import { localizer } from "@/lib/i18n";
import type { MessageData } from "@/lib/messages";
import { isTaggedPayload } from "@/lib/taggedPayload";

import type { OpenMarkdownFileError, SaveMarkdownFileError } from "../services/markdownDocumentApi";
import { formatEncodingName } from "./documentEncoding";

export type { OpenMarkdownFileError, SaveMarkdownFileError } from "../services/markdownDocumentApi";

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
        description: `${formatFileSize(error.sizeBytes, localizer.current)} selected. Files larger than ${formatFileSize(error.maxSizeBytes, localizer.current)} do not load.`,
      };
    case "invalidEncoding":
      return {
        title: "Invalid Markdown file encoding.",
        description:
          "The file is not valid in the encoding it was read in. Leafdown reads UTF-8, and UTF-16 with a byte order mark, unless another encoding is chosen.",
      };
    case "irreversibleEncoding":
      return {
        title: `Markdown file cannot be preserved in ${formatEncodingName(error.encoding)}.`,
        description:
          "Saving it in that encoding would change bytes that were never edited. Choose another encoding.",
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
  "unrepresentableCharacters",
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
    case "unrepresentableCharacters":
      return {
        title: `Some characters cannot be saved in ${formatEncodingName(error.encoding)}.`,
        description: formatUnrepresentableCharacters(error.characters),
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

  return remaining > 0 ? `${listed.join(", ")}, and ${remaining} more` : listed.join(", ");
};
