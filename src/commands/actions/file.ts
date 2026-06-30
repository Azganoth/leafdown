import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import {
  getOpenMarkdownFileErrorMessage,
  getSaveMarkdownFileErrorMessage,
} from "@/features/document";
import {
  getOpenFolderContextErrorMessage,
  useArticleNavigatorStore,
} from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import {
  closeActiveMarkdownDocument,
  createNewMarkdownDocument,
  openFolderContextAtPath,
  openMarkdownFileAtPath,
  pickAndOpenFolderContext,
  pickAndOpenMarkdownFile,
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentAs,
} from "@/features/session";
import { notifyOperationFailure } from "@/lib/errors";
import { notifyError, notifySuccess } from "@/lib/toast";

import {
  getActiveArticleAncestorPaths,
  getActiveSavedFilePath,
  type AppCommandContext,
} from "../context";
import { disabled, enabled } from "../statePrimitives";
import { useCommandUIStore } from "../stores/commandUi";

const saveWithFeedback = async (saveFn: () => Promise<boolean>) => {
  try {
    const saved = await saveFn();
    if (saved) {
      notifySuccess("Document saved.");
    }
  } catch (error) {
    notifyError(getSaveMarkdownFileErrorMessage(error));
  }
};

const documentOnly = (activeDocument: AppCommandContext["activeDocument"]) =>
  activeDocument ? enabled() : disabled("No document is open.");

export const openRecentMarkdownFile = async (path: string) => {
  try {
    const opened = await openMarkdownFileAtPath(path);
    if (opened) {
      notifySuccess("Document opened.");
    }
  } catch (error) {
    const message = getOpenMarkdownFileErrorMessage(error, {
      title: "Could not open recent Markdown file.",
    });
    notifyError(message);
  }
};

export const openRecentFolderContext = async (path: string) => {
  try {
    const opened = await openFolderContextAtPath(path);
    if (opened) {
      notifySuccess("Folder opened.");
    }
  } catch (error) {
    const message = getOpenFolderContextErrorMessage(error, {
      title: "Could not open recent folder.",
    });
    notifyError(message);
  }
};

/* Commands */

export const createNewFile = async () => {
  try {
    const created = await createNewMarkdownDocument();
    if (created) {
      notifySuccess("Document created.");
    }
  } catch (error) {
    notifyOperationFailure("Could not create document.", error, "createNewFile");
  }
};

export const openFile = async () => {
  try {
    const opened = await pickAndOpenMarkdownFile();
    if (opened) {
      notifySuccess("Document opened.");
    }
  } catch (error) {
    notifyError(getOpenMarkdownFileErrorMessage(error));
  }
};

export const openFolder = async () => {
  try {
    const opened = await pickAndOpenFolderContext();
    if (opened) {
      notifySuccess("Folder opened.");
    }
  } catch (error) {
    notifyError(getOpenFolderContextErrorMessage(error));
  }
};

export const clearRecentItems = () => {
  useRecentItemsStore.getState().clearRecentItems();
};

export const saveDocument = async () => {
  await saveWithFeedback(saveActiveMarkdownDocument);
};

export const saveDocumentAs = async () => {
  await saveWithFeedback(saveActiveMarkdownDocumentAs);
};

export const openLocation = async (context: AppCommandContext) => {
  const activeFilePath = getActiveSavedFilePath(context);
  if (activeFilePath) {
    try {
      await revealItemInDir(activeFilePath);
    } catch (error) {
      notifyOperationFailure("Could not open file location.", error, "openLocation");
    }
  }
};

export const revealInSidebar = (context: AppCommandContext) => {
  const activeFilePath = getActiveSavedFilePath(context);
  const activeArticleAncestorPaths = getActiveArticleAncestorPaths(context);

  if (activeFilePath && activeArticleAncestorPaths) {
    useSettingsStore.getState().updateSetting("sidebarVisible", true);
    useArticleNavigatorStore
      .getState()
      .requestRevealArticle(activeFilePath, activeArticleAncestorPaths);
  }
};

export const openPreferences = () => {
  useCommandUIStore.getState().setPreferencesOpen(true);
};

export const closeDocument = async () => {
  try {
    const closed = await closeActiveMarkdownDocument();
    if (closed) {
      notifySuccess("Document closed.");
    }
  } catch (error) {
    notifyOperationFailure("Could not close document.", error, "closeDocument");
  }
};

export const closeWindow = async () => {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    notifyOperationFailure("Could not close window.", error, "closeWindow");
  }
};

/* State */

export const getClearRecentItemsState = (context: AppCommandContext) =>
  context.recentItems.recentFiles.length > 0 || context.recentItems.recentFolders.length > 0
    ? enabled()
    : disabled("No recent items are available.");

export const getSaveDocumentState = (context: AppCommandContext) =>
  !context.activeDocument
    ? disabled("No document is open.")
    : context.activeDocument.status === "saved" && !context.activeDocument.isDirty
      ? disabled("The saved document is clean.")
      : enabled();

export const getSaveDocumentAsState = (context: AppCommandContext) =>
  documentOnly(context.activeDocument);

export const getOpenLocationState = (context: AppCommandContext) =>
  context.activeDocument?.status === "saved"
    ? enabled()
    : disabled("The active document has no file path.");

export const getRevealInSidebarState = (context: AppCommandContext) =>
  getActiveArticleAncestorPaths(context)
    ? enabled()
    : disabled("The active file is not available in the current sidebar.");

export const getCloseDocumentState = (context: AppCommandContext) =>
  documentOnly(context.activeDocument);
