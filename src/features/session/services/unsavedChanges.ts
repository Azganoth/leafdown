import { getActiveDocumentKey, matchesActiveDocumentKey } from "@/features/document";
import { requestConfirmation } from "@/lib/confirmation";
import { t } from "@/lib/i18n";

import { useSessionStore } from "../stores/session";

export const confirmDiscardActiveDocumentChanges = async () => {
  const { activeDocument, activeDocumentGeneration } = useSessionStore.getState();

  if (!activeDocument?.isDirty) {
    return true;
  }

  const documentKey = getActiveDocumentKey(activeDocument);
  const shouldDiscard = await requestConfirmation({
    title: t("session.unsavedChanges.title"),
    message: t("session.unsavedChanges.message"),
    confirmLabel: t("session.unsavedChanges.confirm"),
    cancelLabel: t("session.unsavedChanges.cancel"),
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
