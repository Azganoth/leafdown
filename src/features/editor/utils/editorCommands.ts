import { redo, undo } from "@milkdown/kit/prose/history";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Command } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  chainCommands,
  deleteSelection,
  joinForward,
  selectAll,
  selectNodeForward,
  selectTextblockEnd,
  selectTextblockStart,
} from "@milkdown/kit/prose/commands";

import type { AppCommandId } from "@/features/commands/types";

import {
  getTextWordRangeAfterSelection,
  getTextWordRangeAtSelection,
  getTextWordRangeBeforeSelection,
} from "./editorCommandState";

const deleteForwardCommand = chainCommands(deleteSelection, joinForward, selectNodeForward);

const runProseMirrorCommand = (view: EditorView, command: Command) => {
  view.focus();
  return command(view.state, view.dispatch, view);
};

const dispatchTextSelection = (view: EditorView, from: number, to = from) => {
  view.focus();
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView(),
  );

  return true;
};

const deleteWordRange = (view: EditorView, getRange: typeof getTextWordRangeBeforeSelection) => {
  const range = getRange(view.state);

  if (!range) {
    return false;
  }

  view.focus();
  view.dispatch(view.state.tr.delete(range.from, range.to).scrollIntoView());

  return true;
};

const jumpToSelection = (view: EditorView) => {
  if (view.state.selection.empty) {
    return false;
  }

  view.focus();
  view.dispatch(view.state.tr.scrollIntoView());

  return true;
};

export const runEditorCommand = (view: EditorView, commandId: AppCommandId) => {
  switch (commandId) {
    case "edit.undo":
      return runProseMirrorCommand(view, undo);

    case "edit.redo":
      return runProseMirrorCommand(view, redo);

    case "edit.delete":
      return runProseMirrorCommand(view, deleteForwardCommand);

    case "edit.deleteWordBackward":
      return deleteWordRange(view, getTextWordRangeBeforeSelection);

    case "edit.deleteWordForward":
      return deleteWordRange(view, getTextWordRangeAfterSelection);

    case "edit.selectAll":
      return runProseMirrorCommand(view, selectAll);

    case "edit.selectWord": {
      const range = getTextWordRangeAtSelection(view.state);

      return range ? dispatchTextSelection(view, range.from, range.to) : false;
    }

    case "edit.jumpToTop":
      return dispatchTextSelection(view, TextSelection.atStart(view.state.doc).from);

    case "edit.jumpToBottom":
      return dispatchTextSelection(view, TextSelection.atEnd(view.state.doc).from);

    case "edit.jumpToSelection":
      return jumpToSelection(view);

    case "edit.jumpToLineStart":
      return runProseMirrorCommand(view, selectTextblockStart);

    case "edit.jumpToLineEnd":
      return runProseMirrorCommand(view, selectTextblockEnd);
  }

  return false;
};
