import type { ActiveDocumentState, FolderContextState } from "@/stores/session";
import type { FileTreeSortOrder, SettingsState } from "@/stores/settings";

export type AppCommandId =
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
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.copyAsPlainText"
  | "edit.copyAsMarkdown"
  | "edit.paste"
  | "edit.pasteAsPlainText"
  | "edit.pasteAsMarkdown"
  | "edit.pasteAsRichText"
  | "edit.delete"
  | "edit.deleteWordBackward"
  | "edit.deleteWordForward"
  | "edit.selectAll"
  | "edit.selectWord"
  | "edit.jumpToTop"
  | "edit.jumpToBottom"
  | "edit.jumpToSelection"
  | "edit.jumpToLineStart"
  | "edit.jumpToLineEnd"
  | "edit.lineEnding.crlf"
  | "edit.lineEnding.lf"
  | "edit.insertFinalNewline"
  | "insert.paragraph"
  | "insert.heading1"
  | "insert.heading2"
  | "insert.heading3"
  | "insert.heading4"
  | "insert.heading5"
  | "insert.heading6"
  | "insert.link"
  | "insert.image"
  | "insert.orderedList"
  | "insert.unorderedList"
  | "insert.taskList"
  | "insert.blockquote"
  | "insert.codeBlock"
  | "insert.table"
  | "insert.horizontalRule"
  | "format.strong"
  | "format.emphasis"
  | "format.strikethrough"
  | "format.inlineCode"
  | "format.clearInline"
  | "format.paragraph"
  | "format.heading1"
  | "format.heading2"
  | "format.heading3"
  | "format.heading4"
  | "format.heading5"
  | "format.heading6"
  | "format.increaseHeading"
  | "format.decreaseHeading"
  | "format.orderedList"
  | "format.unorderedList"
  | "format.taskList"
  | "format.increaseListIndent"
  | "format.decreaseListIndent"
  | "format.toggleTaskChecked"
  | "format.blockquote"
  | "format.codeBlock"
  | "format.table.delete"
  | "format.table.addRowAbove"
  | "format.table.addRowBelow"
  | "format.table.addColumnBefore"
  | "format.table.addColumnAfter"
  | "format.table.moveRowUp"
  | "format.table.moveRowDown"
  | "format.table.moveColumnLeft"
  | "format.table.moveColumnRight"
  | "format.table.deleteRow"
  | "format.table.deleteColumn"
  | "format.clearBlock"
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
}

export interface EditorCommandState {
  enabledCommands: Partial<Record<AppCommandId, boolean>>;
  hasActiveEditor: boolean;
  hasSelection: boolean;
  hasTableSelection: boolean;
}

export interface FileTreeCommandState {
  canRevealActiveFile: boolean;
  pendingSortOrder: FileTreeSortOrder | null;
}

export interface CommandStateContext {
  activeDocument: ActiveDocumentState | null;
  editor: EditorCommandState;
  fileTree: FileTreeCommandState;
  folderContext: FolderContextState | null;
  fullscreen: boolean;
  settings: SettingsState;
}

export interface ResolvedCommandState {
  checked?: boolean;
  disabledReason?: string;
  enabled: boolean;
}
