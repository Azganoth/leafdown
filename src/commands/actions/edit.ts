import { getActiveDocumentKey, type ActiveDocumentState } from "@/features/document";
import { useSettingsStore } from "@/features/preferences";
import { useSessionStore } from "@/features/session";

import type { AppCommandContext } from "../context";
import { checked, disabled } from "../statePrimitives";

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

/* Commands */

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

/* State */

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
