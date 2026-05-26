import { redoDepth, undoDepth } from "@milkdown/kit/prose/history";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { AppCommandId, EditorCommandState } from "@/features/commands/types";

interface TextWordRange {
  from: number;
  to: number;
}

interface TextBlockSelectionInfo {
  offset: number;
  start: number;
  text: string;
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
  "insert.link",
  "format.strong",
  "format.emphasis",
  "format.strikethrough",
  "format.inlineCode",
] as const satisfies AppCommandId[];

const selectionEditorCommands = [
  "edit.cut",
  "edit.copy",
  "edit.copyAsPlainText",
  "edit.copyAsMarkdown",
  "edit.jumpToSelection",
  "format.clearInline",
] as const satisfies AppCommandId[];

const isWordCharacter = (value: string) => /^[\p{L}\p{N}_]$/u.test(value);

const getTextBlockSelectionInfo = (state: EditorState): TextBlockSelectionInfo | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }

  const textBlock = selection.$from.parent;

  if (!textBlock.isTextblock) {
    return null;
  }

  return {
    offset: selection.$from.parentOffset,
    start: selection.$from.start(),
    text: textBlock.textBetween(0, textBlock.content.size, "\n", "\n"),
  };
};

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
  const info = getTextBlockSelectionInfo(state);

  if (!info?.text) {
    return null;
  }

  const { offset, start, text } = info;
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

  return {
    from: start + fromOffset,
    to: start + toOffset,
  };
};

export const getTextWordRangeBeforeSelection = (state: EditorState): TextWordRange | null => {
  const info = getTextBlockSelectionInfo(state);

  if (!info?.text || info.offset <= 0 || !isWordCharacter(info.text[info.offset - 1])) {
    return null;
  }

  let fromOffset = info.offset;

  while (fromOffset > 0 && isWordCharacter(info.text[fromOffset - 1])) {
    fromOffset -= 1;
  }

  return {
    from: info.start + fromOffset,
    to: info.start + info.offset,
  };
};

export const getTextWordRangeAfterSelection = (state: EditorState): TextWordRange | null => {
  const info = getTextBlockSelectionInfo(state);

  if (!info?.text || info.offset >= info.text.length || !isWordCharacter(info.text[info.offset])) {
    return null;
  }

  let toOffset = info.offset;

  while (toOffset < info.text.length && isWordCharacter(info.text[toOffset])) {
    toOffset += 1;
  }

  return {
    from: info.start + info.offset,
    to: info.start + toOffset,
  };
};

export const getEditorCommandState = (view: EditorView): EditorCommandState => {
  const { state } = view;
  const hasSelection = !state.selection.empty;
  const hasWordAfterSelection = Boolean(getTextWordRangeAfterSelection(state));
  const hasWordAtSelection = Boolean(getTextWordRangeAtSelection(state));
  const hasWordBeforeSelection = Boolean(getTextWordRangeBeforeSelection(state));
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

  enabledCommands["edit.deleteWordBackward"] = hasWordBeforeSelection;
  enabledCommands["edit.deleteWordForward"] = hasWordAfterSelection;
  enabledCommands["edit.selectWord"] = hasWordAtSelection;

  return {
    enabledCommands,
    hasActiveEditor: true,
    hasSelection,
    hasTableSelection,
  };
};
