import { getOpenMarkdownFileErrorMessage } from "@/features/document";
import {
  createFolderArticle,
  createFolderDirectory,
  getScanFolderContextErrorMessage,
  getTrashName,
  renameFolderContextEntry,
  trashFolderContextEntry,
  useArticleNavigatorStore,
} from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import { requestConfirmation } from "@/lib/confirmation";
import { getPathParts, isSameOrParentPath, rebasePath } from "@/lib/path";
import { notifyError } from "@/lib/toast";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { runAfterPendingSaves } from "./documentWorkflows";
import { refreshFolderContext } from "./folderContextWorkflows";
import { openMarkdownFileAtPath } from "./openSession";
import { confirmDiscardActiveDocumentChanges } from "./unsavedChanges";

export type FolderEntryKind = "directory" | "file";

export const createArticleInFolder = async (parentPath: string, name: string) => {
  const folderPath = getFolderContextPath();

  if (!folderPath || !(await confirmDiscardActiveDocumentChanges())) {
    return null;
  }

  const path = await createFolderArticle({
    defaultExtension: useSettingsStore.getState().defaultNewDocumentExtension,
    folderPath,
    name,
    parentPath,
  });

  await refreshAfterFolderEntryChange();

  try {
    await openMarkdownFileAtPath(path, { discardConfirmed: true });
  } catch (error) {
    notifyError(getOpenMarkdownFileErrorMessage(error));
  }

  return path;
};

export const createDirectoryInFolder = async (parentPath: string, name: string) => {
  const folderPath = getFolderContextPath();

  if (!folderPath) {
    return null;
  }

  const path = await createFolderDirectory({ folderPath, name, parentPath });

  await refreshAfterFolderEntryChange();

  return path;
};

export const renameFolderEntry = (path: string, name: string) =>
  runAfterPendingSaves(async () => {
    const folderPath = getFolderContextPath();

    if (!folderPath) {
      return null;
    }

    const nextPath = await renameFolderContextEntry({ folderPath, name, path });

    if (nextPath !== path) {
      moveActiveDocument(path, nextPath);
      useRecentItemsStore.getState().moveRecentPaths(path, nextPath);
      useArticleNavigatorStore.getState().moveDirectoryPaths(path, nextPath);
      await refreshAfterFolderEntryChange();
    }

    return nextPath;
  });

export const deleteFolderEntry = async (path: string, kind: FolderEntryKind) => {
  const folderPath = getFolderContextPath();

  if (!folderPath) {
    return false;
  }

  const trashName = getTrashName();
  const { name } = getPathParts(path);
  const confirmed = await requestConfirmation({
    title: kind === "directory" ? "Delete folder" : "Delete file",
    message:
      kind === "directory"
        ? `Move "${name}" and everything in it to the ${trashName}?`
        : `Move "${name}" to the ${trashName}?`,
    detail: path,
    confirmLabel: `Move to ${trashName}`,
    cancelLabel: "Cancel",
  });

  if (!confirmed) {
    return false;
  }

  if (activeDocumentIsInside(path) && !(await confirmDiscardActiveDocumentChanges())) {
    return false;
  }

  return runAfterPendingSaves(async () => {
    await trashFolderContextEntry({ folderPath, path });

    if (activeDocumentIsInside(path)) {
      useSessionStore.getState().setActiveDocument(null);
    }

    await refreshAfterFolderEntryChange();

    return true;
  });
};

// The change already happened, so a failed rescan is reported without undoing it; the folder
// watcher converges on the same tree once its next scan succeeds.
const refreshAfterFolderEntryChange = async () => {
  try {
    await refreshFolderContext();
  } catch (error) {
    notifyError(getScanFolderContextErrorMessage(error));
  }
};

const getFolderContextPath = () => useSessionStore.getState().folderContext?.path ?? null;

const activeDocumentIsInside = (path: string) => {
  const { activeDocument } = useSessionStore.getState();

  return activeDocument?.status === "saved" && isSameOrParentPath(path, activeDocument.path);
};

// The editor is keyed by the document path, so the moved document remounts from the Markdown the
// editor holds now rather than from content that may predate the latest edit.
const moveActiveDocument = (fromPath: string, toPath: string) => {
  const { activeDocument, setActiveDocument } = useSessionStore.getState();

  if (activeDocument?.status !== "saved") {
    return;
  }

  const nextPath = rebasePath(activeDocument.path, fromPath, toPath);

  if (nextPath === null) {
    return;
  }

  setActiveDocument({
    ...activeDocument,
    content: documentEditorBridge.getMarkdown(activeDocument.path) ?? activeDocument.content,
    path: nextPath,
  });
};
