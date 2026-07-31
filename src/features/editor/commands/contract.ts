// Kept free of Milkdown imports so consumers that only need the command contract do not
// load the editor stack. `EDITOR_COMMANDS` in ./index.ts is constrained to this manifest,
// so the two cannot drift.
export const EDITOR_COMMAND_IDS = [
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
  "format.clearBlock",
  "format.strong",
  "format.emphasis",
  "format.strikethrough",
  "format.inlineCode",
  "format.clearInline",
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
  "insert.paragraph",
  "insert.heading1",
  "insert.heading2",
  "insert.heading3",
  "insert.heading4",
  "insert.heading5",
  "insert.heading6",
  "insert.image",
  "insert.orderedList",
  "insert.unorderedList",
  "insert.taskList",
  "insert.blockquote",
  "insert.codeBlock",
  "insert.table",
  "insert.horizontalRule",
  "insert.link",
] as const;

export type EditorCommandId = (typeof EDITOR_COMMAND_IDS)[number];

export interface EditorCommandState {
  enabledCommands: Record<EditorCommandId, boolean>;
  status: "inactive" | "ready";
}

export const isEditorCommandId = (value: string): value is EditorCommandId =>
  (EDITOR_COMMAND_IDS as readonly string[]).includes(value);

const createEditorCommandEnabledRecord = (enabled: boolean) =>
  Object.fromEntries(EDITOR_COMMAND_IDS.map((commandId) => [commandId, enabled])) as Record<
    EditorCommandId,
    boolean
  >;

export const INACTIVE_EDITOR_COMMAND_STATE: EditorCommandState = {
  enabledCommands: createEditorCommandEnabledRecord(false),
  status: "inactive",
};

export const READY_DISABLED_EDITOR_COMMAND_STATE: EditorCommandState = {
  enabledCommands: createEditorCommandEnabledRecord(false),
  status: "ready",
};
