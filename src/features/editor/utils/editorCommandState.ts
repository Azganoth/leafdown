import { redoDepth, undoDepth } from "@milkdown/kit/prose/history";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { AppCommandId, EditorCommandState } from "@/features/commands/types";

interface TextWordRange {
  from: number;
  to: number;
}

const activeEditorCommands = [
  "edit.delete",
  "edit.paste",
  "edit.pasteAsPlainText",
  "edit.pasteAsMarkdown",
  "edit.pasteAsRichText",
  "edit.selectAll",
  "edit.jumpToTop",
  "edit.jumpToBottom",
  "edit.jumpToLineStart",
  "edit.jumpToLineEnd",
] as const satisfies AppCommandId[];

const selectionEditorCommands = [
  "edit.cut",
  "edit.copy",
  "edit.copyAsPlainText",
  "edit.copyAsMarkdown",
  "edit.jumpToSelection",
] as const satisfies AppCommandId[];

const wordEditorCommands = [
  "edit.deleteWordBackward",
  "edit.deleteWordForward",
  "edit.selectWord",
] as const satisfies AppCommandId[];

const isWordCharacter = (value: string) => /^[\p{L}\p{N}_]$/u.test(value);

const isInsideNode = (state: EditorState, nodeNames: Set<string>) => {
  const { selection } = state;

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    if (nodeNames.has(selection.$from.node(depth).type.name)) {
      return true;
    }
  }

  return false;
};

export const getTextWordRangeAtSelection = (state: EditorState): TextWordRange | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }

  const textBlock = selection.$from.parent;

  if (!textBlock.isTextblock) {
    return null;
  }

  const text = textBlock.textBetween(0, textBlock.content.size, "\n", "\n");
  const offset = selection.$from.parentOffset;

  if (!text) {
    return null;
  }

  const wordOffset =
    offset > 0 && isWordCharacter(text[offset - 1])
      ? offset - 1
      : offset < text.length && isWordCharacter(text[offset])
        ? offset
        : null;

  if (wordOffset === null) {
    return null;
  }

  let fromOffset = wordOffset;
  let toOffset = wordOffset + 1;

  while (fromOffset > 0 && isWordCharacter(text[fromOffset - 1])) {
    fromOffset -= 1;
  }

  while (toOffset < text.length && isWordCharacter(text[toOffset])) {
    toOffset += 1;
  }

  const textBlockStart = selection.$from.start();

  return {
    from: textBlockStart + fromOffset,
    to: textBlockStart + toOffset,
  };
};

export const getEditorCommandState = (view: EditorView): EditorCommandState => {
  const { state } = view;
  const hasSelection = !state.selection.empty;
  const hasActiveWord = Boolean(getTextWordRangeAtSelection(state));
  const hasTableSelection = isInsideNode(
    state,
    new Set(["table", "table_cell", "table_header", "table_row"]),
  );
  const enabledCommands: Partial<Record<AppCommandId, boolean>> = {
    "edit.undo": undoDepth(state) > 0,
    "edit.redo": redoDepth(state) > 0,
  };

  for (const commandId of activeEditorCommands) {
    enabledCommands[commandId] = true;
  }

  for (const commandId of selectionEditorCommands) {
    enabledCommands[commandId] = hasSelection;
  }

  for (const commandId of wordEditorCommands) {
    enabledCommands[commandId] = hasActiveWord;
  }

  return {
    enabledCommands,
    hasActiveEditor: true,
    hasSelection,
    hasTableSelection,
  };
};
