import type { ActiveDocumentState } from "@/features/document";
import type { EditorCommandState } from "@/features/editor";
import {
  getArticleAncestorDirectoryPaths,
  type FolderContextState,
} from "@/features/folder-context";
import type { RecentItemsState, SettingsState } from "@/features/preferences";

import type { CommandUIState } from "./stores/commandUi";

export type AppCommandRecentItemsContext = Pick<RecentItemsState, "recentFiles" | "recentFolders">;
export type AppCommandSettingsContext = Pick<
  SettingsState,
  "articleSortOrder" | "insertFinalNewline" | "sidebarVisible" | "theme"
>;
export type AppCommandUIContext = Pick<CommandUIState, "fullscreen" | "pendingSortOrder" | "zoom">;

export interface AppCommandContext {
  activeDocument: ActiveDocumentState | null;
  editor: EditorCommandState;
  folderContext: FolderContextState | null;
  recentItems: AppCommandRecentItemsContext;
  settings: AppCommandSettingsContext;
  ui: AppCommandUIContext;
}

export const getActiveSavedFilePath = (context: AppCommandContext) => {
  if (context.activeDocument?.status !== "saved") {
    return null;
  }

  return context.activeDocument.path;
};

export const getActiveArticleAncestorPaths = (context: AppCommandContext) => {
  const activeFilePath = getActiveSavedFilePath(context);

  if (!context.folderContext || !activeFilePath) {
    return null;
  }

  return getArticleAncestorDirectoryPaths(context.folderContext.tree, activeFilePath);
};
