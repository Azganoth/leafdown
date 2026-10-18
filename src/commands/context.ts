import type { ActiveDocumentState, TextEncodingName } from "@/features/document";
import type { CalloutTypeChoice, CalloutTypeChoices, EditorCommandState } from "@/features/editor";
import {
  getArticleAncestorDirectoryPaths,
  type FolderContextState,
} from "@/features/folder-context";
import type { RecentItemsState, SettingsState } from "@/features/preferences";

import type { CommandState } from "./statePrimitives";
import type { CommandUIState } from "./stores/commandUi";

export interface ReopenWithEncodingControl {
  state: CommandState;
  checkedEncoding: TextEncodingName | null;
  reopen: (encoding: TextEncodingName) => void;
}

export interface CalloutTypeControl {
  /** Read as a submenu opens: listing a new callout's types walks the document. */
  read: (choice: CalloutTypeChoice) => CalloutTypeChoices | null;
  choose: (choice: CalloutTypeChoice, token: string) => void;
}

export type AppCommandRecentItemsContext = Pick<RecentItemsState, "recentFiles" | "recentFolders">;
export type AppCommandSettingsContext = Pick<
  SettingsState,
  | "alwaysOnTop"
  | "articleSortOrder"
  | "insertFinalNewline"
  | "showAllFiles"
  | "sidebarVisible"
  | "statusBarVisible"
  | "theme"
>;
export type AppCommandUIContext = Pick<CommandUIState, "fullscreen" | "pendingSortOrder" | "zoom">;

export interface AppCommandTabsContext {
  count: number;
  activeIndex: number;
  activePreview: boolean;
}

export interface AppCommandContext {
  activeDocument: ActiveDocumentState | null;
  tabs: AppCommandTabsContext;
  editor: EditorCommandState;
  folderContext: FolderContextState | null;
  folderContextLoading: boolean;
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
