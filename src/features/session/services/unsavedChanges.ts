import { requestConfirmation } from "@/lib/confirmation";
import { t } from "@/lib/i18n";

import { findCurrentTab, findTab, useSessionStore, type DocumentTab } from "../stores/session";
import { getDocumentName } from "../utils/documentNames";

/**
 * Asks once about the unsaved changes in the given tabs, naming them. Resolves `true` when none has
 * unsaved changes, or when they are discarded while every one still holds the version asked about.
 */
export const confirmDiscardTabChanges = async (tabIds: readonly string[]) => {
  const session = useSessionStore.getState();
  const dirtyTabs = tabIds
    .map((tabId) => findTab(session, tabId))
    .filter((tab): tab is DocumentTab => tab?.document.isDirty === true);

  if (dirtyTabs.length === 0) {
    return true;
  }

  const names = dirtyTabs.map((tab) => getDocumentName(tab.document, t));
  const shouldDiscard = await requestConfirmation(
    names.length === 1
      ? {
          title: t("session.unsavedChanges.title"),
          message: t("session.unsavedChanges.message", { name: names[0] }),
          confirmLabel: t("session.unsavedChanges.confirm"),
          cancelLabel: t("session.unsavedChanges.cancel"),
        }
      : {
          title: t("session.unsavedChanges.title"),
          message: t("session.unsavedDocuments.message", { count: names.length }),
          detail: names.join("\n"),
          confirmLabel: t("session.unsavedDocuments.confirm"),
          cancelLabel: t("session.unsavedDocuments.cancel"),
        },
  );

  if (!shouldDiscard) {
    return false;
  }

  const latestSession = useSessionStore.getState();

  return dirtyTabs.every((tab) => findCurrentTab(latestSession, tab.id, tab.generation) !== null);
};

export const confirmDiscardAllDocumentChanges = () =>
  confirmDiscardTabChanges(useSessionStore.getState().tabs.map((tab) => tab.id));
