import {
  createFolderArticle,
  createFolderDirectory,
  getScanFolderContextErrorMessage,
  getTrashKind,
  renameFolderContextEntry,
  trashFolderContextEntry,
  useArticleNavigatorStore,
} from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import { requestConfirmation } from "@/lib/confirmation";
import { t } from "@/lib/i18n";
import { getPathParts, isSameOrParentPath, rebasePath } from "@/lib/path";
import { notifyError } from "@/lib/toast";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { runAfterPendingSaves } from "./documentWorkflows";
import { refreshFolderContext } from "./folderContextWorkflows";
import { notifyOpenMarkdownFileError, openMarkdownFileAtPath } from "./openSession";
import { confirmDiscardTabChanges } from "./unsavedChanges";

export type FolderEntryKind = "directory" | "file";

export const createArticleInFolder = async (parentPath: string, name: string) => {
  const folderPath = getFolderContextPath();

  if (!folderPath) {
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
    await openMarkdownFileAtPath(path);
  } catch (error) {
    notifyOpenMarkdownFileError(error);
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
      moveOpenDocuments(path, nextPath);
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

  const trash = getTrashKind();
  const { name } = getPathParts(path);
  const confirmed = await requestConfirmation({
    title: t("session.deleteEntry.title", { kind }),
    message: t(
      kind === "directory"
        ? "session.deleteEntry.folderMessage"
        : "session.deleteEntry.fileMessage",
      { name, trash },
    ),
    detail: path,
    confirmLabel: t("session.deleteEntry.confirm", { trash }),
    cancelLabel: t("session.deleteEntry.cancel"),
  });

  if (!confirmed || !(await confirmDiscardTabChanges(getTabIdsInside(path)))) {
    return false;
  }

  return runAfterPendingSaves(async () => {
    await trashFolderContextEntry({ folderPath, path });

    useSessionStore.getState().closeTabs(getTabIdsInside(path));

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

const getTabIdsInside = (path: string) =>
  useSessionStore
    .getState()
    .tabs.filter(
      ({ document }) => document.status === "saved" && isSameOrParentPath(path, document.path),
    )
    .map((tab) => tab.id);

// The editor is keyed by the document path, so a moved document remounts from the Markdown its
// editor holds now rather than from content that may predate the latest edit.
const moveOpenDocuments = (fromPath: string, toPath: string) => {
  const session = useSessionStore.getState();

  for (const { document, id } of session.tabs) {
    if (document.status !== "saved") {
      continue;
    }

    const nextPath = rebasePath(document.path, fromPath, toPath);

    if (nextPath !== null) {
      session.replaceTabDocument(id, {
        ...document,
        content: documentEditorBridge.getMarkdown(document.path) ?? document.content,
        path: nextPath,
      });
    }
  }
};
