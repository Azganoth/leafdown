import {
  chainCommands,
  deleteSelection,
  joinForward,
  selectNodeForward,
} from "@milkdown/kit/prose/commands";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { runProseMirrorCommand } from "../../utils/milkdown";
import { isTextCaretSelection } from "../../utils/selections";
import {
  getTextBetween,
  getTextWordRangeAfterSelection,
  getTextWordRangeBeforeSelection,
} from "../../utils/textRanges";

const deleteForwardCommand = chainCommands(deleteSelection, joinForward, selectNodeForward);

const deleteNextTextCharacter = (view: EditorView) => {
  const { selection } = view.state;

  if (!isTextCaretSelection(selection)) {
    return false;
  }

  const { $cursor } = selection;
  const textAfterCursor = getTextBetween(
    $cursor.parent,
    $cursor.parentOffset,
    $cursor.parent.content.size,
  );
  const nextCharacter = Array.from(textAfterCursor)[0];

  if (!nextCharacter) {
    return false;
  }

  const tr = view.state.tr.delete($cursor.pos, $cursor.pos + nextCharacter.length);

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

const deleteWordRange = (view: EditorView, getRange: typeof getTextWordRangeBeforeSelection) => {
  const range = getRange(view.state);

  if (!range) {
    return false;
  }

  const tr = view.state.tr.delete(range.from, range.to);

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

/* Commands */

export const deleteForward = (view: EditorView) =>
  runProseMirrorCommand(view, deleteForwardCommand) || deleteNextTextCharacter(view);

export const deleteWordBackward = (view: EditorView) =>
  deleteWordRange(view, getTextWordRangeBeforeSelection);

export const deleteWordForward = (view: EditorView) =>
  deleteWordRange(view, getTextWordRangeAfterSelection);

/* State */

export const canDeleteWordBackward = (state: EditorState) =>
  getTextWordRangeBeforeSelection(state) !== null;

export const canDeleteWordForward = (state: EditorState) =>
  getTextWordRangeAfterSelection(state) !== null;
