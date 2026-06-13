import type { Editor } from "@milkdown/kit/core";
import type { MarkdownImageContext } from "../plugins/imageView";
import type { MarkdownLinkContext } from "../utils/linkActivation";

export const editorCommandIds = [
  "edit.undo",
  "edit.redo",
  "edit.cut",
  "edit.copy",
  "edit.copyAsPlainText",
  "edit.copyAsMarkdown",
  "edit.paste",
  "edit.pasteAsPlainText",
  "edit.pasteAsMarkdown",
  "edit.pasteAsRichText",
  "edit.delete",
  "edit.deleteWordBackward",
  "edit.deleteWordForward",
  "edit.selectAll",
  "edit.selectWord",
  "edit.jumpToTop",
  "edit.jumpToBottom",
  "edit.jumpToSelection",
  "edit.jumpToLineStart",
  "edit.jumpToLineEnd",
  "insert.paragraph",
  "insert.heading1",
  "insert.heading2",
  "insert.heading3",
  "insert.heading4",
  "insert.heading5",
  "insert.heading6",
  "insert.link",
  "insert.image",
  "insert.orderedList",
  "insert.unorderedList",
  "insert.taskList",
  "insert.blockquote",
  "insert.codeBlock",
  "insert.table",
  "insert.horizontalRule",
  "format.strong",
  "format.emphasis",
  "format.strikethrough",
  "format.inlineCode",
  "format.clearInline",
  "format.paragraph",
  "format.heading1",
  "format.heading2",
  "format.heading3",
  "format.heading4",
  "format.heading5",
  "format.heading6",
  "format.increaseHeading",
  "format.decreaseHeading",
  "format.orderedList",
  "format.unorderedList",
  "format.taskList",
  "format.increaseListIndent",
  "format.decreaseListIndent",
  "format.toggleTaskChecked",
  "format.blockquote",
  "format.codeBlock",
  "format.table.delete",
  "format.table.addRowAbove",
  "format.table.addRowBelow",
  "format.table.addColumnBefore",
  "format.table.addColumnAfter",
  "format.table.moveRowUp",
  "format.table.moveRowDown",
  "format.table.moveColumnLeft",
  "format.table.moveColumnRight",
  "format.table.deleteRow",
  "format.table.deleteColumn",
  "format.clearBlock",
] as const;

export type EditorCommandId = (typeof editorCommandIds)[number];

const editorCommandIdSet = new Set<string>(editorCommandIds);

export const isEditorCommandId = (commandId: string): commandId is EditorCommandId =>
  editorCommandIdSet.has(commandId);

export interface EditorCommandState {
  enabledCommands: Partial<Record<EditorCommandId, boolean>>;
  hasActiveEditor: boolean;
  hasSelection: boolean;
  hasTableSelection: boolean;
}

export const inactiveEditorCommandState: EditorCommandState = {
  enabledCommands: {},
  hasActiveEditor: false,
  hasSelection: false,
  hasTableSelection: false,
};

export type EditorContextPopupSource = "rightClick" | "selection";

export interface EditorContextPopupAnchor {
  x: number;
  y: number;
}

export interface EditorContextPopupRequest {
  anchor: EditorContextPopupAnchor;
  source: EditorContextPopupSource;
}

export interface MilkdownMarkdownUpdate {
  markdown: string;
  previousMarkdown: string;
}

export interface MilkdownEditorBridge {
  getMarkdown: () => string;
  getCommandState?: () => EditorCommandState;
  runCommand?: (commandId: EditorCommandId) => boolean | Promise<boolean>;
}

export interface CreateMilkdownEditorOptions {
  root: HTMLElement;
  initialMarkdown: string;
  onMarkdownUpdated?: (update: MilkdownMarkdownUpdate) => void;
  onContentTransaction?: () => void;
  onCommandStateChanged?: () => void;
  onContextPopupClosed?: () => void;
  onContextPopupRequested?: (request: EditorContextPopupRequest) => void;
  getContextPopupOpen?: () => boolean;
  getAutoPairBracketsAndQuotes?: () => boolean;
  getImageContext?: () => MarkdownImageContext;
  getLinkContext?: () => MarkdownLinkContext;
}

export type MilkdownEditorInstance = Editor;
