import {
  getActiveDocumentKey,
  isSameEncoding,
  isUtf8Encoding,
  UTF8_ENCODING,
  UTF8_WITH_BOM_ENCODING,
  type ActiveDocumentState,
  type TextEncodingName,
  type DocumentEncoding,
} from "@/features/document";
import { useSettingsStore } from "@/features/preferences";
import { reopenMarkdownFileWithChosenEncoding, useSessionStore } from "@/features/session";

import type { AppCommandContext } from "../context";
import { checked, disabled, enabled } from "../statePrimitives";

const setActiveDocumentEncoding = (
  activeDocument: ActiveDocumentState | null,
  encoding: DocumentEncoding,
) => {
  if (!activeDocument) {
    return;
  }

  useSessionStore
    .getState()
    .setActiveDocumentEncoding(getActiveDocumentKey(activeDocument), encoding);
};

const getConvertibleFileEncoding = (activeDocument: ActiveDocumentState | null) =>
  activeDocument?.status === "saved" && !isUtf8Encoding(activeDocument.fileEncoding)
    ? activeDocument.fileEncoding
    : null;

export const setUtf8Encoding = (context: AppCommandContext) => {
  setActiveDocumentEncoding(context.activeDocument, UTF8_ENCODING);
};

export const setUtf8WithBomEncoding = (context: AppCommandContext) => {
  setActiveDocumentEncoding(context.activeDocument, UTF8_WITH_BOM_ENCODING);
};

export const setFileEncoding = (context: AppCommandContext) => {
  const fileEncoding = getConvertibleFileEncoding(context.activeDocument);

  if (fileEncoding) {
    setActiveDocumentEncoding(context.activeDocument, fileEncoding);
  }
};

export const reopenWithEncoding = async (
  { activeDocument }: AppCommandContext,
  encoding: TextEncodingName,
) => {
  if (activeDocument?.status !== "saved" || activeDocument.fileEncoding.bom) {
    return;
  }

  await reopenMarkdownFileWithChosenEncoding(activeDocument.path, encoding);
};

export const getReopenedEncodingName = ({ activeDocument }: AppCommandContext) => {
  if (activeDocument?.status !== "saved" || activeDocument.fileEncoding.bom) {
    return null;
  }

  return activeDocument.fileEncoding.name;
};

const getEncodingState = (context: AppCommandContext, encoding: DocumentEncoding) =>
  context.activeDocument
    ? checked(isSameEncoding(context.activeDocument.encoding, encoding))
    : disabled("No document is open.");

export const getUtf8EncodingState = (context: AppCommandContext) =>
  getEncodingState(context, UTF8_ENCODING);

export const getUtf8WithBomEncodingState = (context: AppCommandContext) =>
  getEncodingState(context, UTF8_WITH_BOM_ENCODING);

export const getFileEncodingState = (context: AppCommandContext) => {
  const fileEncoding = getConvertibleFileEncoding(context.activeDocument);

  return fileEncoding
    ? getEncodingState(context, fileEncoding)
    : disabled("The document's file is not in another encoding.");
};

export const getReopenWithEncodingState = ({ activeDocument }: AppCommandContext) => {
  if (activeDocument?.status !== "saved") {
    return disabled("The active document has no file path.");
  }

  return activeDocument.fileEncoding.bom
    ? disabled("The file's byte order mark sets its encoding.")
    : enabled();
};

const setActiveDocumentLineEnding = (
  activeDocument: ActiveDocumentState | null,
  lineEnding: "crlf" | "lf",
) => {
  if (!activeDocument) {
    return;
  }

  const activeDocumentKey = getActiveDocumentKey(activeDocument);
  useSessionStore.getState().setActiveDocumentLineEnding(activeDocumentKey, lineEnding);
};

export const setCrlfLineEnding = (context: AppCommandContext) => {
  setActiveDocumentLineEnding(context.activeDocument, "crlf");
};

export const setLfLineEnding = (context: AppCommandContext) => {
  setActiveDocumentLineEnding(context.activeDocument, "lf");
};

export const toggleFinalNewline = () => {
  const settings = useSettingsStore.getState();
  settings.updateSetting("insertFinalNewline", !settings.insertFinalNewline);
};

export const getCrlfLineEndingState = (context: AppCommandContext) =>
  context.activeDocument
    ? checked(context.activeDocument.lineEnding === "crlf")
    : disabled("No document is open.");

export const getLfLineEndingState = (context: AppCommandContext) =>
  context.activeDocument
    ? checked(context.activeDocument.lineEnding === "lf")
    : disabled("No document is open.");

export const getFinalNewlineState = (context: AppCommandContext) =>
  checked(context.settings.insertFinalNewline);
