import { getCurrentWindow } from "@tauri-apps/api/window";

import { selectFolderContextPath } from "@/features/folder-context";
import { SequentialTaskQueue } from "@/lib/async";
import { requestConfirmation } from "@/lib/confirmation";
import { notifyOperationFailure } from "@/lib/errors";
import { t } from "@/lib/i18n";
import { notifyError } from "@/lib/toast";

import { useNamedFoldersStore } from "../stores/namedFolders";
import { findTabByPath, getSessionFolderPath, useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { flushContextSession, forgetContextSnapshots, restoreContextSession } from "./keptSession";
import {
  createNamedFolder,
  editNamedFolder,
  listNamedFolders,
  selectNamedFolder,
  type NamedFolder,
} from "./namedFoldersApi";
import { cancelOpenSessionTransitions, runAfterPendingSaves } from "./sessionTasks";
import { confirmDiscardAllDocumentChanges } from "./unsavedChanges";

const transitions = new SequentialTaskQueue();

export const refreshNamedFolders = async () => {
  useNamedFoldersStore.getState().applySnapshot(await listNamedFolders());
};

export const showNamedFolders = () => useNamedFoldersStore.setState({ dialogOpen: true });

export const runNamedFolderAction = async (action: () => Promise<unknown>) => {
  try {
    await action();
  } catch (error) {
    if (error && typeof error === "object" && "kind" in error) {
      const kind = error.kind;
      if (kind === "contextBusy" || kind === "unsavedDrafts" || kind === "invalidContext") {
        notifyError({
          title: t(
            kind === "contextBusy"
              ? "session.namedFolders.busy"
              : kind === "unsavedDrafts"
                ? "session.namedFolders.unsaved"
                : "session.namedFolders.failed",
          ),
        });
        return;
      }
    }
    notifyOperationFailure(t("session.namedFolders.failed"), error, "namedFolderAction");
  }
};

export const keepNamedFolder = (name: string) =>
  transitions.run(async () => {
    const path = getSessionFolderPath(useSessionStore.getState());
    if (!path || useNamedFoldersStore.getState().activeId || !name.trim()) {
      return false;
    }
    useNamedFoldersStore.setState({ transitioning: true });
    cancelOpenSessionTransitions();
    try {
      return await runAfterPendingSaves(async () => {
        if (!(await flushContextSession())) {
          return false;
        }
        const id = crypto.randomUUID();
        await createNamedFolder(id, name.trim(), path);
        useNamedFoldersStore.setState({ activeId: id });
        await refreshNamedFolders();
        return true;
      });
    } finally {
      useNamedFoldersStore.setState({ transitioning: false });
    }
  });

export const activateNamedFolder = (
  id: string | null,
  newWindow = false,
  documentPath?: string,
): Promise<boolean> =>
  transitions.run(async () => {
    const state = useNamedFoldersStore.getState();
    const target = state.folders.find((folder) => folder.id === id);
    if (id === state.activeId && !newWindow) {
      activateOwnedTab(documentPath);
      return true;
    }
    const elsewhere = target?.windowLabel && target.windowLabel !== getCurrentWindow().label;
    if (
      !newWindow &&
      !elsewhere &&
      !state.activeId &&
      !(await confirmDiscardAllDocumentChanges())
    ) {
      return false;
    }
    useNamedFoldersStore.setState({ transitioning: true });
    cancelOpenSessionTransitions();
    try {
      return await runAfterPendingSaves(async () => {
        if (!newWindow && !elsewhere && !(await flushContextSession())) {
          return false;
        }
        const selected = await selectNamedFolder(id, newWindow, documentPath);
        if (selected.kind === "focused" || newWindow) {
          return true;
        }
        documentEditorBridge.clear();
        useNamedFoldersStore.setState({ activeId: id });
        useSessionStore.getState().reset();
        if (selected.session) {
          await restoreContextSession(selected.session);
        }
        forgetContextSnapshots();
        activateOwnedTab(documentPath);
        await refreshNamedFolders();
        return true;
      });
    } finally {
      useNamedFoldersStore.setState({ transitioning: false });
    }
  });

const activateOwnedTab = (path?: string) => {
  if (!path) {
    return;
  }
  const tab = findTabByPath(useSessionStore.getState(), path);
  if (tab) {
    useSessionStore.getState().activateTab(tab.id);
  }
};

export const renameNamedFolder = async (id: string, name: string) => {
  await editNamedFolder(id, { name });
  await refreshNamedFolders();
};

export const locateNamedFolder = async (id: string) => {
  const path = await selectFolderContextPath();
  if (!path) {
    return;
  }
  await editNamedFolder(id, { path });
  await refreshNamedFolders();
};

export const removeNamedFolder = async (folder: NamedFolder) => {
  const expectedRevision = useNamedFoldersStore.getState().revision;
  if (
    !(await requestConfirmation({
      title: t("session.namedFolders.removeTitle"),
      message: t(
        folder.hasUnsavedDrafts
          ? "session.namedFolders.removeDrafts"
          : "session.namedFolders.removeMessage",
        { name: folder.name },
      ),
      confirmLabel: t("session.namedFolders.remove"),
      cancelLabel: t("session.namedFolders.cancel"),
    }))
  ) {
    return;
  }
  await editNamedFolder(folder.id, {
    remove: true,
    discardUnsaved: folder.hasUnsavedDrafts,
    expectedRevision,
  });
  await refreshNamedFolders();
};
