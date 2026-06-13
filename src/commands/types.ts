import type { ActiveDocumentState } from "@/features/document";
import type { EditorCommandId, EditorCommandState } from "@/features/editor";
import type { ArticleSortOrder, FolderContextState } from "@/features/folder-context";
import type { SettingsState } from "@/features/preferences";
import type { SessionHistoryState } from "@/features/session";

export type ApplicationCommandId =
  | "file.new"
  | "file.open"
  | "file.openFolder"
  | "file.clearRecentItems"
  | "file.save"
  | "file.saveAs"
  | "file.openLocation"
  | "file.revealInSidebar"
  | "file.preferences"
  | "file.closeDocument"
  | "file.closeWindow"
  | "edit.lineEnding.crlf"
  | "edit.lineEnding.lf"
  | "edit.insertFinalNewline"
  | "view.toggleSidebar"
  | "view.zoomIn"
  | "view.zoomOut"
  | "view.resetZoom"
  | "view.fullscreen"
  | "view.appearance.system"
  | "view.appearance.light"
  | "view.appearance.dark"
  | "view.sort.name"
  | "view.sort.modifiedDate"
  | "view.sort.type"
  | "view.collapseAllFolders"
  | "view.expandAllFolders"
  | "help.about";

export type AppCommandId = ApplicationCommandId | EditorCommandId;
export type CommandMenuId = "file" | "edit" | "insert" | "format" | "view" | "help";

export interface CommandShortcut {
  key: string;
  alt?: boolean;
  mod?: boolean;
  shift?: boolean;
}

export interface CommandDefinition {
  id: AppCommandId;
  label: string;
  shortcut?: CommandShortcut;
  shortcuts?: CommandShortcut[];
}

export interface ArticleNavigatorCommandState {
  canRevealActiveArticle: boolean;
  pendingSortOrder: ArticleSortOrder | null;
}

export interface CommandStateContext {
  activeDocument: ActiveDocumentState | null;
  editor: EditorCommandState;
  folderContext: FolderContextState | null;
  fullscreen: boolean;
  history: SessionHistoryState;
  navigator: ArticleNavigatorCommandState;
  settings: SettingsState;
}

export interface ResolvedCommandState {
  checked?: boolean;
  disabledReason?: string;
  enabled: boolean;
}
