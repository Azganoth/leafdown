import { getActiveDocumentKey, getSaveMarkdownFileErrorMessage } from "@/features/document";
import { localizer, t } from "@/lib/i18n";
import { getPathIdentityKey, getPathParts } from "@/lib/path";
import { notifyError, persistentToastManager, type ToastActionMenuItem } from "@/lib/toast";

import { findTab, useSessionStore, type DocumentTab } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { notifyOpenMarkdownFileError, openMarkdownFileAtPath } from "./documentOpenWorkflows";
import { saveDocumentTabAs } from "./documentWorkflows";

const getNoticeKey = ({ id, generation, document }: DocumentTab) => {
  if (document.status !== "saved" || !document.externalChange) return null;
  const change = document.externalChange;
  return JSON.stringify([
    id,
    generation,
    getPathIdentityKey(document.path),
    change.kind,
    change.kind === "modified" ? change.fingerprint : null,
  ]);
};

export const followDocumentNotices = () => {
  const dismissed = new Map<string, string>();
  let toastId: string | null = null;
  let signature = "";

  const close = () => {
    const id = toastId;
    toastId = null;
    if (id) persistentToastManager.close(id);
  };

  const refresh = () => {
    const { tabs } = useSessionStore.getState();
    for (const [id, key] of dismissed) {
      const tab = tabs.find((candidate) => candidate.id === id);
      if (!tab || getNoticeKey(tab) !== key) dismissed.delete(id);
    }
    const affected = tabs.filter((tab) => {
      const key = getNoticeKey(tab);
      return key !== null && dismissed.get(tab.id) !== key;
    });
    const nextSignature = JSON.stringify([localizer.current.locale, affected.map(getNoticeKey)]);
    if (signature === nextSignature) return;
    signature = nextSignature;
    if (affected.length === 0) {
      close();
      return;
    }

    const items: ToastActionMenuItem[] = [];
    for (const tab of affected) {
      const document = tab.document;
      if (document.status !== "saved") continue;
      const path = document.path;
      const name = affected.length > 1 ? path : getPathParts(path).name;
      const stillAffected = () => {
        const current = findTab(useSessionStore.getState(), tab.id);
        return current && getNoticeKey(current) === getNoticeKey(tab) ? current : null;
      };
      items.push(
        {
          label: t("session.notices.show", { name }),
          run: () => {
            const current = stillAffected();
            if (!current) return;
            useSessionStore.getState().activateTab(current.id);
            documentEditorBridge.focusWhenShown(getActiveDocumentKey(current.document));
          },
        },
        {
          label: t("session.notices.saveAs", { name }),
          run: () => {
            if (!stillAffected()) return;
            void saveDocumentTabAs(tab.id).catch((error) =>
              notifyError(getSaveMarkdownFileErrorMessage(error)),
            );
          },
        },
      );
      if (document.externalChange?.kind === "modified") {
        items.push({
          label: t("session.notices.reload", { name }),
          run: () => {
            if (!stillAffected()) return;
            void openMarkdownFileAtPath(path, { reload: true, activate: false }).catch((error) =>
              notifyOpenMarkdownFileError(error),
            );
          },
        });
      }
    }
    const first = affected[0].document;
    const message =
      affected.length === 1 && first.status === "saved"
        ? {
            title: t(
              first.externalChange?.kind === "missing"
                ? "session.notices.missing"
                : "session.notices.modified",
            ),
            description: t("session.notices.document", { name: first.path }),
          }
        : {
            title: t("session.notices.multiple", { count: affected.length }),
            description: localizer.current.formatList(
              affected
                .slice(0, 3)
                .map((tab) =>
                  tab.document.status === "saved" ? getPathParts(tab.document.path).name : "",
                ),
            ),
          };
    const options = {
      ...message,
      type: "warning",
      timeout: 0,
      data: {
        actionMenu: { label: t("session.notices.actions"), kind: "actions" as const, items },
      },
    };
    if (toastId) {
      persistentToastManager.update(toastId, options);
    } else {
      const id = persistentToastManager.add({
        ...options,
        onClose: () => {
          if (toastId !== id) return;
          for (const tab of useSessionStore.getState().tabs) {
            const key = getNoticeKey(tab);
            if (key) dismissed.set(tab.id, key);
          }
          toastId = null;
          signature = "";
        },
      });
      toastId = id;
    }
  };
  const unsubscribe = useSessionStore.subscribe(refresh);
  const language = localizer.onDidChange(refresh);
  refresh();
  return () => {
    unsubscribe();
    language.dispose();
    close();
  };
};
