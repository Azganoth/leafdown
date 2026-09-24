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
  closeFolderContext as closeFolderContextWorkflow,
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

const runBooleanCommand = async (
  operation: () => Promise<boolean>,
  successMessage: string,
  handleError: (error: unknown) => void,
) => {
  try {
    if (await operation()) {
      notifySuccess(successMessage);
    }
  } catch (error) {
    handleError(error);
  }
};

const documentOnly = (activeDocument: AppCommandContext["activeDocument"]) =>
  activeDocument ? enabled() : disabled("No document is open.");

export const openRecentMarkdownFile = async (path: string) => {
  await runBooleanCommand(
    () => openMarkdownFileAtPath(path),
    "Document opened.",
    (error) =>
      notifyError(
        getOpenMarkdownFileErrorMessage(error, {
          title: "Could not open recent Markdown file.",
        }),
      ),
  );
};

export const openRecentFolderContext = async (path: string) => {
  await runBooleanCommand(
    () => openFolderContextAtPath(path),
    "Folder opened.",
    (error) =>
      notifyError(
        getOpenFolderContextErrorMessage(error, {
          title: "Could not open recent folder.",
        }),
      ),
  );
};

export const createUntitledDocument = async () => {
  await runBooleanCommand(createNewMarkdownDocument, "Document created.", (error) =>
    notifyOperationFailure("Could not create document.", error, "createUntitledDocument"),
  );
};

export const openMarkdownFile = async () => {
  await runBooleanCommand(pickAndOpenMarkdownFile, "Document opened.", (error) =>
    notifyError(getOpenMarkdownFileErrorMessage(error)),
  );
};

export const openFolderContext = async () => {
  await runBooleanCommand(pickAndOpenFolderContext, "Folder opened.", (error) =>
    notifyError(getOpenFolderContextErrorMessage(error)),
  );
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
  await runBooleanCommand(closeActiveMarkdownDocument, "Document closed.", (error) =>
    notifyOperationFailure("Could not close document.", error, "closeDocument"),
  );
};

export const closeFolderContext = async () => {
  await runBooleanCommand(closeFolderContextWorkflow, "Folder closed.", (error) =>
    notifyOperationFailure("Could not close folder.", error, "closeFolderContext"),
  );
};

export const closeWindow = async () => {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    notifyOperationFailure("Could not close window.", error, "closeWindow");
  }
};

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

export const getCloseFolderState = (context: AppCommandContext) =>
  context.folderContext ? enabled() : disabled("No folder context is open.");
