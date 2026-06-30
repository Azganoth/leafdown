import {
  redo as milkdownRedo,
  undo as milkdownUndo,
  redoDepth,
  undoDepth,
} from "@milkdown/kit/prose/history";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  canDeferInlineSourceProjectionToNativeHistory,
  canRedoInlineSourceProjection,
  canUndoInlineSourceProjection,
  hasActiveInlineSourceProjection,
  redoInlineSourceProjection,
  undoInlineSourceProjection,
} from "../../plugins/inlineSourceProjection";
import { runProseMirrorCommand } from "../../utils/milkdown";

const canUseHistory = (
  state: EditorState,
  canUseProjectionHistory: (state: EditorState) => boolean,
  getNativeHistoryDepth: (state: EditorState) => number,
) => {
  const nativeHistoryDepth = getNativeHistoryDepth(state);

  if (!hasActiveInlineSourceProjection(state)) {
    return nativeHistoryDepth > 0;
  }

  return (
    canUseProjectionHistory(state) ||
    (canDeferInlineSourceProjectionToNativeHistory(state) && nativeHistoryDepth > 0)
  );
};

/* Commands */

export const undo = (view: EditorView) =>
  undoInlineSourceProjection(view) || runProseMirrorCommand(view, milkdownUndo);

export const redo = (view: EditorView) =>
  redoInlineSourceProjection(view) || runProseMirrorCommand(view, milkdownRedo);

/* State */

export const canUndo = (state: EditorState) =>
  canUseHistory(state, canUndoInlineSourceProjection, undoDepth);

export const canRedo = (state: EditorState) =>
  canUseHistory(state, canRedoInlineSourceProjection, redoDepth);
