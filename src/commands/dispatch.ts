import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

import {
  getOpenMarkdownFileErrorMessage,
  getSaveMarkdownFileErrorMessage,
  showDocumentIoErrorToast,
} from "@/features/document";
import { isEditorCommandId } from "@/features/editor";
import {
  getArticleDirectoryPaths,
  getOpenFolderContextErrorMessage,
  useArticleNavigatorStore,
  type ArticleSortOrder,
  type FolderContextState,
} from "@/features/folder-context";
import { useSettingsStore, type AppearanceTheme } from "@/features/preferences";
import {
  changeArticleSortOrder,
  closeActiveMarkdownDocument,
  createNewMarkdownDocument,
  openFolderContextPath,
  openFolderContextPicker,
  openMarkdownFile,
  openMarkdownFilePath,
  runActiveDocumentEditorCommand,
  saveActiveMarkdownDocument,
  saveActiveMarkdownDocumentAs,
  useSessionHistoryStore,
  useSessionStore,
} from "@/features/session";

import type { AppCommandId } from "./types";

const zoomStep = 0.1;
const minimumZoom = 0.5;
const maximumZoom = 2;

export interface AppCommandDispatchContext {
  activeArticleAncestorPaths: string[] | null;
  activeDocumentKey: string | null;
  activeFilePath: string | null;
  folderContext: FolderContextState | null;
  fullscreen: boolean;
  pendingSortOrder: ArticleSortOrder | null;
  setAboutOpen: (open: boolean) => void;
  setFullscreen: (fullscreen: boolean) => void;
  setPendingSortOrder: (sortOrder: ArticleSortOrder | null) => void;
  setPreferencesOpen: (open: boolean) => void;
  setZoom: (zoom: number) => void;
  zoom: number;
}

export const dispatchAppCommand = (commandId: AppCommandId, context: AppCommandDispatchContext) => {
  const settings = useSettingsStore.getState();

  switch (commandId) {
    case "file.new":
      void createNewMarkdownDocument();
      return;
    case "file.open":
      void openMarkdownFile().catch(showOpenFileError);
      return;
    case "file.openFolder":
      void openFolderContextPicker().catch(showOpenFolderError);
      return;
    case "file.clearRecentItems":
      useSessionHistoryStore.getState().clearRecentItems();
      return;
    case "file.save":
      saveWithFeedback(saveActiveMarkdownDocument);
      return;
    case "file.saveAs":
      saveWithFeedback(saveActiveMarkdownDocumentAs);
      return;
    case "file.openLocation":
      if (context.activeFilePath) {
        void revealItemInDir(context.activeFilePath).catch((error: unknown) => {
          toast.error("Could not open file location.", { description: String(error) });
        });
      }
      return;
    case "file.revealInSidebar":
      if (context.activeFilePath && context.activeArticleAncestorPaths) {
        settings.updateSetting("sidebarVisible", true);
        useArticleNavigatorStore
          .getState()
          .requestRevealArticle(context.activeFilePath, context.activeArticleAncestorPaths);
      }
      return;
    case "file.preferences":
      context.setPreferencesOpen(true);
      return;
    case "file.closeDocument":
      void closeActiveMarkdownDocument();
      return;
    case "file.closeWindow":
      void getCurrentWindow().close();
      return;
    case "edit.lineEnding.crlf":
      setActiveDocumentLineEnding(context.activeDocumentKey, "crlf");
      return;
    case "edit.lineEnding.lf":
      setActiveDocumentLineEnding(context.activeDocumentKey, "lf");
      return;
    case "edit.insertFinalNewline":
      settings.updateSetting("insertFinalNewline", !settings.insertFinalNewline);
      return;
    case "view.toggleSidebar":
      settings.updateSetting("sidebarVisible", !settings.sidebarVisible);
      return;
    case "view.zoomIn":
      updateZoom(Math.min(maximumZoom, context.zoom + zoomStep), context.setZoom);
      return;
    case "view.zoomOut":
      updateZoom(Math.max(minimumZoom, context.zoom - zoomStep), context.setZoom);
      return;
    case "view.resetZoom":
      updateZoom(1, context.setZoom);
      return;
    case "view.fullscreen":
      void getCurrentWindow()
        .setFullscreen(!context.fullscreen)
        .then(() => context.setFullscreen(!context.fullscreen))
        .catch(console.error);
      return;
    case "view.appearance.system":
      settings.updateSetting("theme", "system" satisfies AppearanceTheme);
      return;
    case "view.appearance.light":
      settings.updateSetting("theme", "light" satisfies AppearanceTheme);
      return;
    case "view.appearance.dark":
      settings.updateSetting("theme", "dark" satisfies AppearanceTheme);
      return;
    case "view.sort.name":
      changeSortOrder("name", context);
      return;
    case "view.sort.modifiedDate":
      changeSortOrder("modifiedDate", context);
      return;
    case "view.sort.type":
      changeSortOrder("type", context);
      return;
    case "view.collapseAllFolders":
      useArticleNavigatorStore.getState().collapseAll();
      return;
    case "view.expandAllFolders":
      if (context.folderContext) {
        useArticleNavigatorStore
          .getState()
          .expandDirectories(getArticleDirectoryPaths(context.folderContext.tree));
      }
      return;
    case "help.about":
      context.setAboutOpen(true);
      return;
  }

  if (context.activeDocumentKey && isEditorCommandId(commandId)) {
    void Promise.resolve(
      runActiveDocumentEditorCommand(context.activeDocumentKey, commandId),
    ).catch(console.error);
  }
};

export const openRecentMarkdownFile = (path: string) => {
  void openMarkdownFilePath(path).catch((error: unknown) =>
    showDocumentIoErrorToast(
      toast.error,
      getOpenMarkdownFileErrorMessage(error, {
        title: "Could not open recent Markdown file.",
      }),
    ),
  );
};

export const openRecentFolderContext = (path: string) => {
  void openFolderContextPath(path).catch((error: unknown) =>
    showDocumentIoErrorToast(
      toast.error,
      getOpenFolderContextErrorMessage(error, {
        title: "Could not open recent folder.",
      }),
    ),
  );
};

const setActiveDocumentLineEnding = (documentKey: string | null, lineEnding: "crlf" | "lf") => {
  if (documentKey) {
    useSessionStore.getState().setActiveDocumentLineEnding(documentKey, lineEnding);
  }
};

const updateZoom = (zoom: number, setZoom: (zoom: number) => void) => {
  void getCurrentWebview()
    .setZoom(zoom)
    .then(() => setZoom(zoom))
    .catch(console.error);
};

const changeSortOrder = (sortOrder: ArticleSortOrder, context: AppCommandDispatchContext) => {
  if (context.pendingSortOrder) {
    return;
  }

  context.setPendingSortOrder(sortOrder);
  void changeArticleSortOrder(sortOrder)
    .catch((error: unknown) => {
      showDocumentIoErrorToast(
        toast.error,
        getOpenFolderContextErrorMessage({ kind: "scanFailed", error }),
      );
    })
    .finally(() => context.setPendingSortOrder(null));
};

const saveWithFeedback = (save: () => Promise<boolean>) => {
  void save()
    .then((saved) => {
      if (saved) {
        toast.success("Document saved.");
      }
    })
    .catch((error: unknown) => {
      showDocumentIoErrorToast(toast.error, getSaveMarkdownFileErrorMessage(error));
    });
};

const showOpenFileError = (error: unknown) => {
  showDocumentIoErrorToast(toast.error, getOpenMarkdownFileErrorMessage(error));
};

const showOpenFolderError = (error: unknown) => {
  showDocumentIoErrorToast(toast.error, getOpenFolderContextErrorMessage(error));
};
