import {
  chainCommands,
  deleteSelection,
  joinForward,
  selectNodeForward,
} from "@milkdown/kit/prose/commands";
import { closeHistory } from "@milkdown/kit/prose/history";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { deleteSelectedBlocks } from "../../plugins/blockSelectionOperations";
import {
  deleteSourceProjectionRange,
  getActiveSourceProjectionRange,
} from "../../plugins/sourceProjection";
import { runProseMirrorCommand } from "../../utils/milkdown";
import { isTextCaretSelection } from "../../utils/selections";
import { getSentenceRange } from "../../utils/sentenceRanges";
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

export const deleteSentence = (view: EditorView) => {
  const projectionRange = getActiveSourceProjectionRange(view.state);
  const range = getSentenceRange(view.state, projectionRange);

  if (!range) {
    return false;
  }

  if (projectionRange) {
    return deleteSourceProjectionRange(view, range);
  }

  view.focus();
  view.dispatch(closeHistory(view.state.tr.delete(range.from, range.to)).scrollIntoView());

  return true;
};

export const deleteForward = (view: EditorView) =>
  deleteSelectedBlocks(view) ||
  runProseMirrorCommand(view, deleteForwardCommand) ||
  deleteNextTextCharacter(view);

export const deleteWordBackward = (view: EditorView) =>
  deleteWordRange(view, getTextWordRangeBeforeSelection);

export const deleteWordForward = (view: EditorView) =>
  deleteWordRange(view, getTextWordRangeAfterSelection);

export const canDeleteSentence = (state: EditorState) =>
  getSentenceRange(state, getActiveSourceProjectionRange(state)) !== null;

export const canDeleteWordBackward = (state: EditorState) =>
  getTextWordRangeBeforeSelection(state) !== null;

export const canDeleteWordForward = (state: EditorState) =>
  getTextWordRangeAfterSelection(state) !== null;
