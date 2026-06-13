import { confirm as showConfirmDialog } from "@tauri-apps/plugin-dialog";

import { getActiveDocumentKey } from "@/features/document";
import { useSessionStore } from "../stores/session";

export const confirmActiveDocumentTransition = async () => {
  const activeDocument = useSessionStore.getState().activeDocument;

  if (!activeDocument?.isDirty) {
    return true;
  }

  const documentKey = getActiveDocumentKey(activeDocument);
  const shouldDiscard = await showConfirmDialog(
    "The active document has unsaved changes. Discard them and continue?",
    {
      title: "Unsaved changes",
      kind: "warning",
      okLabel: "Discard changes",
      cancelLabel: "Keep editing",
    },
  );

  if (!shouldDiscard) {
    return false;
  }

  const latestDocument = useSessionStore.getState().activeDocument;

  return Boolean(latestDocument && getActiveDocumentKey(latestDocument) === documentKey);
};
