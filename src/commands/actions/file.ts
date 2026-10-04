import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

import {
  getOpenMarkdownFileErrorMessage,
  getSaveMarkdownFileErrorMessage,
  getWriteHtmlExportErrorMessage,
  isWriteHtmlExportError,
} from "@/features/document";
import type { HtmlExportWarning } from "@/features/editor";
import {
  getOpenFolderContextErrorMessage,
  useArticleNavigatorStore,
} from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import {
  closeActiveMarkdownDocument,
  closeFolderContext as closeFolderContextWorkflow,
  createNewMarkdownDocument,
  exportActiveMarkdownDocumentAsHtml,
  notifyOpenMarkdownFileError,
  openFolderContextAtPath,
  openMarkdownFileAtPath,
  pickAndOpenFolderContext,
  pickAndOpenMarkdownFile,
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentAs,
} from "@/features/session";
import { notifyOperationFailure } from "@/lib/errors";
import { t, type MessageId } from "@/lib/i18n";
import { notifyError, notifySuccess, notifyWarning } from "@/lib/toast";

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
      notifySuccess(t("commands.file.saved"));
    }
  } catch (error) {
    notifyError(getSaveMarkdownFileErrorMessage(error));
  }
};

const runBooleanCommand = async (
  operation: () => Promise<boolean>,
  successMessageId: MessageId,
  handleError: (error: unknown) => void,
) => {
  try {
    if (await operation()) {
      notifySuccess(t(successMessageId));
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
    "commands.file.documentOpened",
    (error) =>
      notifyOpenMarkdownFileError(
        error,
        getOpenMarkdownFileErrorMessage(error, {
          title: t("commands.file.openRecentFileFailed"),
        }),
      ),
  );
};

export const openRecentFolderContext = async (path: string) => {
  await runBooleanCommand(
    () => openFolderContextAtPath(path),
    "commands.file.folderOpened",
    (error) =>
      notifyError(
        getOpenFolderContextErrorMessage(error, {
          title: t("commands.file.openRecentFolderFailed"),
        }),
      ),
  );
};

export const createUntitledDocument = async () => {
  await runBooleanCommand(createNewMarkdownDocument, "commands.file.documentCreated", (error) =>
    notifyOperationFailure(
      t("commands.file.createDocumentFailed"),
      error,
      "createUntitledDocument",
    ),
  );
};

export const openMarkdownFile = async () => {
  await runBooleanCommand(pickAndOpenMarkdownFile, "commands.file.documentOpened", (error) =>
    notifyOpenMarkdownFileError(error),
  );
};

export const openFolderContext = async () => {
  await runBooleanCommand(pickAndOpenFolderContext, "commands.file.folderOpened", (error) =>
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

const LISTED_EXPORT_WARNING_COUNT = 3;

const describeHtmlExportWarning = (warning: HtmlExportWarning) => {
  switch (warning.kind) {
    case "image":
      return t(`commands.file.exportWarning.image.${warning.reason}`, { target: warning.target });
    case "diagram":
      return t("commands.file.exportWarning.diagram");
    case "mathFonts":
      return t("commands.file.exportWarning.mathFonts");
  }
};

export const exportDocumentAsHtml = async () => {
  try {
    const outcome = await exportActiveMarkdownDocumentAsHtml();

    if (outcome.status !== "exported") {
      return;
    }

    if (outcome.warnings.length === 0) {
      notifySuccess(t("commands.file.exported"), outcome.path);
      return;
    }

    const listed = outcome.warnings
      .slice(0, LISTED_EXPORT_WARNING_COUNT)
      .map(describeHtmlExportWarning);
    const unlisted = outcome.warnings.length - listed.length;

    notifyWarning(
      t("commands.file.exportedWithWarnings", { count: outcome.warnings.length }),
      [
        ...listed,
        ...(unlisted > 0 ? [t("commands.file.exportWarning.more", { count: unlisted })] : []),
      ].join(" "),
    );
  } catch (error) {
    if (isWriteHtmlExportError(error)) {
      notifyError(getWriteHtmlExportErrorMessage(error));
      return;
    }

    notifyOperationFailure(t("document.exportError.fallback"), error, "exportDocumentAsHtml");
  }
};

export const revealPathInFileManager = async (
  path: string,
  failureTitle: string,
  operation: string,
) => {
  try {
    await revealItemInDir(path);
  } catch (error) {
    notifyOperationFailure(failureTitle, error, operation);
  }
};

export const openLocation = async (context: AppCommandContext) => {
  const activeFilePath = getActiveSavedFilePath(context);
  if (activeFilePath) {
    await revealPathInFileManager(
      activeFilePath,
      t("commands.file.openLocationFailed"),
      "openLocation",
    );
  }
};

export const revealInSidebar = (context: AppCommandContext) => {
  const activeFilePath = getActiveSavedFilePath(context);
  const activeArticleAncestorPaths = getActiveArticleAncestorPaths(context);

  if (activeFilePath && activeArticleAncestorPaths) {
    useSettingsStore.getState().updateSetting("sidebarVisible", true);
    useArticleNavigatorStore.getState().requestReveal(activeFilePath, activeArticleAncestorPaths);
  }
};

export const openPreferences = () => {
  useCommandUIStore.getState().setPreferencesOpen(true);
};

export const closeDocument = async () => {
  await runBooleanCommand(closeActiveMarkdownDocument, "commands.file.documentClosed", (error) =>
    notifyOperationFailure(t("commands.file.closeDocumentFailed"), error, "closeDocument"),
  );
};

export const closeFolderContext = async () => {
  await runBooleanCommand(closeFolderContextWorkflow, "commands.file.folderClosed", (error) =>
    notifyOperationFailure(t("commands.file.closeFolderFailed"), error, "closeFolderContext"),
  );
};

export const closeWindow = async () => {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    notifyOperationFailure(t("commands.file.closeWindowFailed"), error, "closeWindow");
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

export const getExportDocumentAsHtmlState = (context: AppCommandContext) =>
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
