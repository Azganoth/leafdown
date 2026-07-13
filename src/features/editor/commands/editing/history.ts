import {
  redo as milkdownRedo,
  undo as milkdownUndo,
  redoDepth,
  undoDepth,
} from "@milkdown/kit/prose/history";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import {
  canDeferSourceProjectionToNativeHistory,
  canRedoSourceProjection,
  canUndoSourceProjection,
  hasActiveSourceProjection,
  redoSourceProjection,
  undoSourceProjection,
} from "../../plugins/sourceProjection";
import { runProseMirrorCommand } from "../../utils/milkdown";

const canUseHistory = (
  state: EditorState,
  canUseProjectionHistory: (state: EditorState) => boolean,
  getNativeHistoryDepth: (state: EditorState) => number,
) => {
  const nativeHistoryDepth = getNativeHistoryDepth(state);

  if (!hasActiveSourceProjection(state)) {
    return nativeHistoryDepth > 0;
  }

  return (
    canUseProjectionHistory(state) ||
    (canDeferSourceProjectionToNativeHistory(state) && nativeHistoryDepth > 0)
  );
};

/* Commands */

export const undo = (view: EditorView) =>
  undoSourceProjection(view) || runProseMirrorCommand(view, milkdownUndo);

export const redo = (view: EditorView) =>
  redoSourceProjection(view) || runProseMirrorCommand(view, milkdownRedo);

/* State */

export const canUndo = (state: EditorState) =>
  canUseHistory(state, canUndoSourceProjection, undoDepth);

export const canRedo = (state: EditorState) =>
  canUseHistory(state, canRedoSourceProjection, redoDepth);
