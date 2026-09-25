import {
  getFolderEntryErrorMessage,
  isFolderEntryError,
  type ArticleNavigatorEntryActionResult,
  type ArticleNavigatorEntryActions,
  type ArticleNavigatorEntryKind,
} from "@/features/folder-context";
import {
  createArticleInFolder,
  createDirectoryInFolder,
  deleteFolderEntry,
  renameFolderEntry,
} from "@/features/session";
import { notifyOperationFailure } from "@/lib/errors";
import { notifyError, notifySuccess } from "@/lib/toast";

import { revealPathInFileManager } from "./file";

const notifyFolderEntryFailure = (title: string, error: unknown, operation: string) => {
  if (isFolderEntryError(error)) {
    notifyError(getFolderEntryErrorMessage(error, { title }));
    return;
  }

  notifyOperationFailure(title, error, operation);
};

const toActionResult = (path: string | null): ArticleNavigatorEntryActionResult =>
  path ? { outcome: "applied", path } : { outcome: "cancelled" };

export const createNavigatorEntry = async (
  parentPath: string,
  entryKind: ArticleNavigatorEntryKind,
  name: string,
): Promise<ArticleNavigatorEntryActionResult> => {
  try {
    return toActionResult(
      entryKind === "file"
        ? await createArticleInFolder(parentPath, name)
        : await createDirectoryInFolder(parentPath, name),
    );
  } catch (error) {
    notifyFolderEntryFailure(
      entryKind === "file" ? "Could not create file." : "Could not create folder.",
      error,
      "createNavigatorEntry",
    );

    return { outcome: "failed" };
  }
};

export const renameNavigatorEntry = async (
  path: string,
  name: string,
): Promise<ArticleNavigatorEntryActionResult> => {
  try {
    return toActionResult(await renameFolderEntry(path, name));
  } catch (error) {
    notifyFolderEntryFailure("Could not rename item.", error, "renameNavigatorEntry");

    return { outcome: "failed" };
  }
};

export const deleteNavigatorEntry = async (path: string, entryKind: ArticleNavigatorEntryKind) => {
  try {
    await deleteFolderEntry(path, entryKind);
  } catch (error) {
    notifyFolderEntryFailure(
      entryKind === "file" ? "Could not delete file." : "Could not delete folder.",
      error,
      "deleteNavigatorEntry",
    );
  }
};

export const copyNavigatorPath = async (path: string) => {
  try {
    const clipboard = navigator.clipboard;

    if (!clipboard?.writeText) {
      throw new Error("Clipboard is unavailable.");
    }

    await clipboard.writeText(path);
    notifySuccess("Path copied.");
  } catch (error) {
    notifyOperationFailure("Could not copy path.", error, "copyNavigatorPath");
  }
};

export const ARTICLE_NAVIGATOR_ENTRY_ACTIONS: ArticleNavigatorEntryActions = {
  copyPath: (path) => void copyNavigatorPath(path),
  createEntry: createNavigatorEntry,
  deleteEntry: (path, entryKind) => void deleteNavigatorEntry(path, entryKind),
  renameEntry: renameNavigatorEntry,
  revealEntry: (path) =>
    void revealPathInFileManager(path, "Could not open location.", "revealNavigatorEntry"),
};
