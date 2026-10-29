import { getSaveMarkdownFileErrorMessage } from "@/features/document";
import {
  answerConfirmation,
  requestConfirmation,
  requestDecision,
  useConfirmationStore,
} from "@/lib/confirmation";
import { handleUnexpectedError } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { DisposableStore } from "@/lib/lifecycle";
import { getPathParts } from "@/lib/path";
import { notifyError } from "@/lib/toast";

import { findTab, getActiveTab, useSessionStore, type DocumentTab } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { saveDocumentTabAs } from "./documentWorkflows";
import { getDocumentText, getExternalChangeKey, reloadExternalDocument } from "./externalChanges";

export class ExternalChangeDialogs {
  private readonly disposables = new DisposableStore();
  private readonly acknowledged = new Map<string, string>();
  private focused = false;
  private disposed = false;
  private pending: { tab: DocumentTab; requestId: number | null } | null = null;

  constructor() {
    this.disposables.add(useSessionStore.subscribe(this.refresh));
    this.disposables.add(useConfirmationStore.subscribe(this.refresh));
  }

  setFocused = (focused: boolean) => {
    this.focused = focused;
    this.refresh();
  };

  dispose = () => {
    this.disposed = true;
    this.disposables.dispose();
    if (this.pending?.requestId) answerConfirmation(this.pending.requestId, false);
  };

  private refresh = () => {
    if (this.disposed) return;
    const session = useSessionStore.getState();
    for (const [id, key] of this.acknowledged) {
      const tab = findTab(session, id);
      if (!tab || getExternalChangeKey(tab) !== key) this.acknowledged.delete(id);
    }

    if (this.pending) {
      const current = findTab(session, this.pending.tab.id);
      if (
        this.pending.requestId &&
        (!current ||
          session.activeTabId !== current.id ||
          getExternalChangeKey(current) !== getExternalChangeKey(this.pending.tab))
      ) {
        this.acknowledged.delete(this.pending.tab.id);
        answerConfirmation(this.pending.requestId, false);
      }
      return;
    }

    if (!this.focused || useConfirmationStore.getState().current) return;
    const tab = getActiveTab(session);
    const key = tab && getExternalChangeKey(tab);
    if (!tab || !key || this.acknowledged.get(tab.id) === key) return;

    this.acknowledged.set(tab.id, key);
    this.pending = { tab, requestId: null };
    void this.ask(tab)
      .catch((error) => handleUnexpectedError(error, "externalChangeDecision"))
      .finally(() => {
        this.pending = null;
        this.refresh();
      });
  };

  private async ask(tab: DocumentTab) {
    const { document } = tab;
    if (document.status !== "saved" || !document.externalChange) return;
    const text = getDocumentText(tab);
    const viewState = documentEditorBridge.getViewState(document.path);
    const name = getPathParts(document.path).name;
    const options = {
      detail: document.path,
      cancelLabel: t("session.unsavedChanges.cancel"),
    };
    const missing = document.externalChange.kind === "missing";
    const answer = missing
      ? requestConfirmation({
          ...options,
          title: t("session.externalChange.missing.title"),
          message: t("session.externalChange.missing.message", { name }),
          confirmLabel: t("session.missingSavedFile.confirm"),
        }).then((confirmed) => (confirmed ? "alternate" : "cancel"))
      : requestDecision({
          ...options,
          title: t("session.externalChange.modified.title"),
          message: t(
            document.isDirty
              ? "session.externalChange.modified.unsavedMessage"
              : "session.externalChange.modified.message",
            { name },
          ),
          confirmLabel: t("session.externalChange.reload"),
          alternateLabel: t("session.missingSavedFile.confirm"),
        });
    if (this.pending) this.pending.requestId = useConfirmationStore.getState().current?.id ?? null;
    const decision = await answer;
    if (this.pending) this.pending.requestId = null;
    const session = useSessionStore.getState();
    const current = findTab(session, tab.id);
    if (
      this.disposed ||
      !this.focused ||
      session.activeTabId !== tab.id ||
      !current ||
      getExternalChangeKey(current) !== getExternalChangeKey(tab) ||
      getDocumentText(current) !== text
    ) {
      return;
    }
    if (decision === "confirm") {
      await reloadExternalDocument(tab, text, viewState);
    } else if (decision === "alternate") {
      await saveDocumentTabAs(tab.id).catch((error) =>
        notifyError(getSaveMarkdownFileErrorMessage(error)),
      );
    }
  }
}
