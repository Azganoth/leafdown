import {
  selectAll as proseSelectAll,
  selectTextblockEnd,
  selectTextblockStart,
} from "@milkdown/kit/prose/commands";
import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { runProseMirrorCommand } from "../../utils/milkdown";
import { getTextWordRangeAtSelection } from "../../utils/textRanges";

const dispatchTextSelection = (view: EditorView, from: number, to = from) => {
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

/* Commands */

export const selectAll = (view: EditorView) => runProseMirrorCommand(view, proseSelectAll);

export const selectWord = (view: EditorView) => {
  const range = getTextWordRangeAtSelection(view.state);

  if (!range) {
    return false;
  }

  return dispatchTextSelection(view, range.from, range.to);
};

export const jumpToTop = (view: EditorView) =>
  dispatchTextSelection(view, TextSelection.atStart(view.state.doc).from);

export const jumpToBottom = (view: EditorView) =>
  dispatchTextSelection(view, TextSelection.atEnd(view.state.doc).from);

export const jumpToSelection = (view: EditorView) => {
  if (view.state.selection.empty) {
    return false;
  }

  view.focus();
  view.dispatch(view.state.tr.scrollIntoView());

  return true;
};

export const jumpToLineStart = (view: EditorView) =>
  runProseMirrorCommand(view, selectTextblockStart);

export const jumpToLineEnd = (view: EditorView) => runProseMirrorCommand(view, selectTextblockEnd);

/* State */

export const canSelectWord = (state: EditorState) => getTextWordRangeAtSelection(state) !== null;

export const canJumpToSelection = (state: EditorState) => !state.selection.empty;
