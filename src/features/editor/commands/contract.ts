// The Milkdown-free half of the editor's command API, imported directly rather than through
// `@/features/editor` because that root exports `MilkdownEditor` and so loads Milkdown and
// Shiki. Consumers that route, label, or describe commands use this module; consumers that
// execute one still go through the feature root. `EDITOR_COMMANDS` in ./index.ts satisfies
// this manifest, so the two cannot drift.
// See docs/patterns.md#commands.
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
