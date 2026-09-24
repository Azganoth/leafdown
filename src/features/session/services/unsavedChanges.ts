import { getActiveDocumentKey, matchesActiveDocumentKey } from "@/features/document";
import { requestConfirmation } from "@/lib/confirmation";

import { useSessionStore } from "../stores/session";

export const confirmDiscardActiveDocumentChanges = async () => {
  const { activeDocument, activeDocumentGeneration } = useSessionStore.getState();

  if (!activeDocument?.isDirty) {
    return true;
  }

  const documentKey = getActiveDocumentKey(activeDocument);
  const shouldDiscard = await requestConfirmation({
    title: "Unsaved changes",
    message: "The active document has unsaved changes. Discard them and continue?",
    confirmLabel: "Discard changes",
    cancelLabel: "Keep editing",
  });

  if (!shouldDiscard) {
    return false;
  }

  const latestSession = useSessionStore.getState();
  const latestDocument = latestSession.activeDocument;

  return (
    latestDocument !== null &&
    latestSession.activeDocumentGeneration === activeDocumentGeneration &&
    matchesActiveDocumentKey(latestDocument, documentKey)
  );
};
