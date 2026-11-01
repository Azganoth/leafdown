import { getCurrentWindow } from "@tauri-apps/api/window";

import { scanFolderContext, selectFolderContextPath } from "@/features/folder-context";
import { SequentialTaskQueue } from "@/lib/async";
import { isSamePath } from "@/lib/path";
import { notifyError } from "@/lib/toast";

import { useNamedFoldersStore } from "../stores/namedFolders";
import { findTabByPath, getSessionFolderPath, useSessionStore } from "../stores/session";
import { getBookmarkError } from "./bookmarkErrors";
import { documentEditorBridge } from "./documentEditorBridge";
import { getSessionFolderScanOptions } from "./folderContextOptions";
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
    const failure = getBookmarkError(error);
    notifyError({ title: failure.message });
  }
};

export const createBookmark = (name: string, path: string) =>
  transitions.run(async () => {
    if (!name.trim() || !path.trim()) return false;
    useNamedFoldersStore.setState({ transitioning: true });
    cancelOpenSessionTransitions();
    try {
      return await runAfterPendingSaves(async () => {
        const currentPath = getSessionFolderPath(useSessionStore.getState());
        if (currentPath && isSamePath(currentPath, path.trim()) && !(await flushContextSession()))
          return false;
        const contextId = await createNamedFolder(crypto.randomUUID(), name.trim(), path.trim());
        useNamedFoldersStore.setState({ activeId: contextId });
        await refreshNamedFolders();
        return true;
      });
    } finally {
      useNamedFoldersStore.setState({ transitioning: false });
    }
  });

export const keepNamedFolder = (name: string) => {
  const path = getSessionFolderPath(useSessionStore.getState());
  return path ? createBookmark(name, path) : Promise.resolve(false);
};

export const activateNamedFolder = (
  id: string | null,
  newWindow = false,
  documentPath?: string,
  recoverDrafts = false,
): Promise<boolean> =>
  transitions.run(async () => {
    const state = useNamedFoldersStore.getState();
    const target =
      state.sessions.find((folder) => folder.id === id) ??
      state.folders.find((folder) => folder.contextId === id);
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
        const preparedFolder =
          target && !elsewhere && !recoverDrafts
            ? await scanFolderContext(target.path, getSessionFolderScanOptions())
            : undefined;
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
          await restoreContextSession(selected.session, preparedFolder);
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
  await editNamedFolder(folder.id, {
    remove: true,
  });
  await refreshNamedFolders();
};
