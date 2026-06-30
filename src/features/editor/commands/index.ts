import { type Editor } from "@milkdown/kit/core";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { withEditorView } from "../utils/milkdown";
import * as clipboard from "./editing/clipboard";
import * as deletion from "./editing/deletion";
import * as history from "./editing/history";
import * as selection from "./editing/selection";
import type { HeadingLevel } from "./formatting/blocks";
import * as blockFormatting from "./formatting/blocks";
import * as inlineFormatting from "./formatting/inline";
import * as tables from "./formatting/tables";
import * as blockInsertion from "./inserting/blocks";
import * as linkInsertion from "./inserting/links";

type EditorCommandResult = boolean | Promise<boolean>;
type EditorCommandRunner = (editor: Editor) => EditorCommandResult;
type EditorViewCommandRunner = (view: EditorView) => EditorCommandResult;
type EditorCommandAvailability = (state: EditorState) => boolean;

interface EditorCommand {
  canRun: EditorCommandAvailability;
  run: EditorCommandRunner;
}

const alwaysEnabled = () => true;

const viewCommand = (
  run: EditorViewCommandRunner,
  canRun: EditorCommandAvailability = alwaysEnabled,
): EditorCommand => ({
  run: withEditorView(run),
  canRun,
});

const editorCommand = (
  run: EditorCommandRunner,
  canRun: EditorCommandAvailability = alwaysEnabled,
): EditorCommand => ({
  run,
  canRun,
});

const formatHeadingCommand = (level: HeadingLevel) =>
  viewCommand((view) => blockFormatting.toggleHeading(view, level));

const insertHeadingCommand = (level: HeadingLevel) =>
  viewCommand((view) => blockInsertion.insertHeading(view, level));

export const EDITOR_COMMANDS = {
  "edit.undo": viewCommand(history.undo, history.canUndo),
  "edit.redo": viewCommand(history.redo, history.canRedo),

  "edit.cut": viewCommand(clipboard.cutSelection, clipboard.canCopy),
  "edit.copy": viewCommand((view) => clipboard.copySelection(view, "default"), clipboard.canCopy),
  "edit.copyAsPlainText": viewCommand(
    (view) => clipboard.copySelection(view, "plainText"),
    clipboard.canCopy,
  ),
  "edit.copyAsMarkdown": viewCommand(
    (view) => clipboard.copySelection(view, "markdown"),
    clipboard.canCopy,
  ),
  "edit.paste": editorCommand((editor) => clipboard.paste(editor, "default")),
  "edit.pasteAsPlainText": editorCommand((editor) => clipboard.paste(editor, "plainText")),
  "edit.pasteAsMarkdown": editorCommand((editor) => clipboard.paste(editor, "markdown")),
  "edit.pasteAsRichText": editorCommand((editor) => clipboard.paste(editor, "richText")),

  "edit.delete": viewCommand(deletion.deleteForward),
  "edit.deleteWordBackward": viewCommand(
    deletion.deleteWordBackward,
    deletion.canDeleteWordBackward,
  ),
  "edit.deleteWordForward": viewCommand(deletion.deleteWordForward, deletion.canDeleteWordForward),

  "edit.selectAll": viewCommand(selection.selectAll),
  "edit.selectWord": viewCommand(selection.selectWord, selection.canSelectWord),
  "edit.jumpToTop": viewCommand(selection.jumpToTop),
  "edit.jumpToBottom": viewCommand(selection.jumpToBottom),
  "edit.jumpToSelection": viewCommand(selection.jumpToSelection, selection.canJumpToSelection),
  "edit.jumpToLineStart": viewCommand(selection.jumpToLineStart),
  "edit.jumpToLineEnd": viewCommand(selection.jumpToLineEnd),

  "format.paragraph": viewCommand(blockFormatting.setParagraph),
  "format.heading1": formatHeadingCommand(1),
  "format.heading2": formatHeadingCommand(2),
  "format.heading3": formatHeadingCommand(3),
  "format.heading4": formatHeadingCommand(4),
  "format.heading5": formatHeadingCommand(5),
  "format.heading6": formatHeadingCommand(6),
  "format.increaseHeading": viewCommand(blockFormatting.increaseHeadingLevel, (state) =>
    blockFormatting.canChangeHeadingLevel(state, 1),
  ),
  "format.decreaseHeading": viewCommand(blockFormatting.decreaseHeadingLevel, (state) =>
    blockFormatting.canChangeHeadingLevel(state, -1),
  ),
  "format.orderedList": viewCommand(blockFormatting.toggleOrderedList),
  "format.unorderedList": viewCommand(blockFormatting.toggleUnorderedList),
  "format.taskList": viewCommand(blockFormatting.toggleTaskList),
  "format.increaseListIndent": viewCommand(
    blockFormatting.increaseListIndent,
    blockFormatting.canIncreaseListIndent,
  ),
  "format.decreaseListIndent": viewCommand(
    blockFormatting.decreaseListIndent,
    blockFormatting.canDecreaseListIndent,
  ),
  "format.toggleTaskChecked": viewCommand(
    blockFormatting.toggleTaskChecked,
    blockFormatting.canToggleTaskChecked,
  ),
  "format.blockquote": viewCommand(blockFormatting.toggleBlockquote),
  "format.codeBlock": viewCommand(blockFormatting.toggleCodeBlock),
  "format.clearBlock": viewCommand(
    blockFormatting.clearBlockFormat,
    blockFormatting.canClearBlockFormat,
  ),

  "format.strong": viewCommand(inlineFormatting.toggleStrong),
  "format.emphasis": viewCommand(inlineFormatting.toggleEmphasis),
  "format.strikethrough": viewCommand(inlineFormatting.toggleStrikethrough),
  "format.inlineCode": viewCommand(inlineFormatting.toggleInlineCode),
  "format.clearInline": viewCommand(
    inlineFormatting.clearInlineFormat,
    inlineFormatting.canClearInlineFormat,
  ),

  "format.table.delete": viewCommand(tables.deleteTable, tables.canUseTable),
  "format.table.addRowAbove": viewCommand(tables.addRowAbove, tables.canAddRowAbove),
  "format.table.addRowBelow": viewCommand(tables.addRowBelow, tables.canAddRowBelow),
  "format.table.addColumnBefore": viewCommand(tables.addColumnBefore, tables.canUseTable),
  "format.table.addColumnAfter": viewCommand(tables.addColumnAfter, tables.canUseTable),
  "format.table.moveRowUp": viewCommand(tables.moveRowUp, (state) => tables.canMoveRows(state, -1)),
  "format.table.moveRowDown": viewCommand(tables.moveRowDown, (state) =>
    tables.canMoveRows(state, 1),
  ),
  "format.table.moveColumnLeft": viewCommand(tables.moveColumnLeft, (state) =>
    tables.canMoveColumns(state, -1),
  ),
  "format.table.moveColumnRight": viewCommand(tables.moveColumnRight, (state) =>
    tables.canMoveColumns(state, 1),
  ),
  "format.table.deleteRow": viewCommand(tables.deleteRows, tables.canDeleteRows),
  "format.table.deleteColumn": viewCommand(tables.deleteColumns, tables.canUseTable),

  "insert.paragraph": viewCommand(blockInsertion.insertParagraph),
  "insert.heading1": insertHeadingCommand(1),
  "insert.heading2": insertHeadingCommand(2),
  "insert.heading3": insertHeadingCommand(3),
  "insert.heading4": insertHeadingCommand(4),
  "insert.heading5": insertHeadingCommand(5),
  "insert.heading6": insertHeadingCommand(6),
  "insert.image": viewCommand(blockInsertion.insertImage),
  "insert.orderedList": viewCommand(blockInsertion.insertOrderedList),
  "insert.unorderedList": viewCommand(blockInsertion.insertUnorderedList),
  "insert.taskList": viewCommand(blockInsertion.insertTaskList),
  "insert.blockquote": viewCommand(blockInsertion.insertBlockquote),
  "insert.codeBlock": viewCommand(blockInsertion.insertCodeBlock),
  "insert.table": viewCommand(blockInsertion.insertTable),
  "insert.horizontalRule": viewCommand(blockInsertion.insertHorizontalRule),
  "insert.link": viewCommand(linkInsertion.insertLink),
} satisfies Record<string, EditorCommand>;

export type EditorCommandId = keyof typeof EDITOR_COMMANDS & string;

export const EDITOR_COMMAND_IDS = Object.keys(EDITOR_COMMANDS) as EditorCommandId[];

export const isEditorCommandId = (value: string): value is EditorCommandId =>
  Object.hasOwn(EDITOR_COMMANDS, value);

export const runEditorCommand = (editor: Editor, commandId: EditorCommandId) =>
  EDITOR_COMMANDS[commandId].run(editor);

export interface EditorCommandState {
  enabledCommands: Record<EditorCommandId, boolean>;
  status: "inactive" | "ready";
}

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

export const getEditorCommandState = (view: EditorView): EditorCommandState => ({
  enabledCommands: Object.fromEntries(
    EDITOR_COMMAND_IDS.map((commandId) => [
      commandId,
      EDITOR_COMMANDS[commandId].canRun(view.state),
    ]),
  ) as Record<EditorCommandId, boolean>,
  status: "ready",
});
