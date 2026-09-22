import { Plugin, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { BlockSelection, createHierarchicalBlockSelection } from "./blockSelection";
import { getBlockSelectionEditingBookmark } from "./blockSelectionKeyboard";

interface MovableRange {
  from: number;
  to: number;
  startIndex: number;
  endIndex: number;
  selection: BlockSelection;
}

const getMovableRange = (state: EditorState): MovableRange | null => {
  const { selection } = state;
  if (!(selection instanceof BlockSelection) || !selection.$from.sameParent(selection.$to)) {
    return null;
  }

  return {
    from: selection.from,
    to: selection.to,
    startIndex: selection.$from.index(),
    endIndex: selection.$to.index(),
    selection,
  };
};

const getMoveToBoundary = (state: EditorState, boundary: number) => {
  const range = getMovableRange(state);
  if (!range) return null;
  const { doc } = state;
  if (boundary < 0 || boundary > doc.content.size) return null;
  const $boundary = doc.resolve(boundary);
  if (
    !$boundary.sameParent(range.selection.$from) ||
    boundary === range.from ||
    boundary === range.to
  ) {
    return null;
  }
  if (boundary > range.from && boundary < range.to) return null;

  const parent = range.selection.$from.parent;
  const boundaryIndex = $boundary.index();
  if (
    parent.childCount === 0 ||
    boundaryIndex === range.startIndex ||
    boundaryIndex === range.endIndex
  ) {
    return null;
  }

  const selected = parent.content.cut(
    range.selection.$from.parentOffset,
    range.selection.$to.parentOffset,
  );
  const movingUp = boundary < range.from;
  const displaced = movingUp
    ? parent.content.cut($boundary.parentOffset, range.selection.$from.parentOffset)
    : parent.content.cut(range.selection.$to.parentOffset, $boundary.parentOffset);
  const replacement = movingUp ? selected.append(displaced) : displaced.append(selected);
  const replaceFrom = movingUp ? boundary : range.from;
  const replaceTo = movingUp ? range.to : boundary;
  const firstIndex = movingUp ? boundaryIndex : range.startIndex;
  const lastIndex = movingUp ? range.endIndex : boundaryIndex;

  if (!parent.canReplace(firstIndex, lastIndex, replacement)) return null;

  return {
    ...range,
    replacement,
    replaceFrom,
    replaceTo,
    nextFrom: movingUp ? replaceFrom : range.from + displaced.size,
  };
};

const getMove = (state: EditorState, direction: -1 | 1) => {
  const range = getMovableRange(state);
  if (!range) return null;
  const parent = range.selection.$from.parent;
  const adjacentIndex = direction === -1 ? range.startIndex - 1 : range.endIndex;
  if (adjacentIndex < 0 || adjacentIndex >= parent.childCount) return null;
  const boundary =
    direction === -1
      ? range.from - parent.child(adjacentIndex).nodeSize
      : range.to + parent.child(adjacentIndex).nodeSize;
  return getMoveToBoundary(state, boundary);
};

export const canMoveSelectedBlocks = (state: EditorState, direction: -1 | 1) =>
  getMove(state, direction) !== null;

export const canMoveSelectedBlocksToBoundary = (state: EditorState, boundary: number) =>
  getMoveToBoundary(state, boundary) !== null;

const dispatchMove = (view: EditorView, move: NonNullable<ReturnType<typeof getMove>>) => {
  const { selection } = move;
  const offset = move.nextFrom - move.from;
  const tr = view.state.tr.replaceWith(move.replaceFrom, move.replaceTo, move.replacement);
  tr.setSelection(
    createHierarchicalBlockSelection(
      tr.doc,
      selection.$anchorBlock.pos + offset,
      selection.$headBlock.pos + offset,
    ),
  );
  view.focus();
  view.dispatch(tr.scrollIntoView());
  return true;
};

export const moveSelectedBlocks = (view: EditorView, direction: -1 | 1) => {
  const move = getMove(view.state, direction);
  if (!move) return false;
  return dispatchMove(view, move);
};

export const moveSelectedBlocksToBoundary = (view: EditorView, boundary: number) => {
  const move = getMoveToBoundary(view.state, boundary);
  if (!move) return false;
  return dispatchMove(view, move);
};

export const deleteSelectedBlocks = (view: EditorView) => {
  const { selection } = view.state;
  if (!(selection instanceof BlockSelection)) return false;

  const bookmark = getBlockSelectionEditingBookmark(view.state);
  const tr = view.state.tr.deleteSelection();
  const originalCaret = bookmark?.resolve(view.state.doc);
  if (
    originalCaret instanceof TextSelection &&
    (originalCaret.to <= selection.from || originalCaret.from >= selection.to)
  ) {
    const mapped = bookmark?.map(tr.mapping).resolve(tr.doc);
    if (mapped instanceof TextSelection) tr.setSelection(mapped);
  }

  view.focus();
  view.dispatch(tr.scrollIntoView());
  return true;
};

export const createLeafdownBlockSelectionOperationsPlugin = () =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleKeyDown: (view, event) => {
            if (event.defaultPrevented) return false;
            if (
              event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.shiftKey &&
              view.state.selection instanceof BlockSelection &&
              (event.key === "ArrowUp" || event.key === "ArrowDown")
            ) {
              moveSelectedBlocks(view, event.key === "ArrowUp" ? -1 : 1);
              return true;
            }

            if (
              (event.key !== "Backspace" && event.key !== "Delete") ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey
            ) {
              return false;
            }

            return deleteSelectedBlocks(view);
          },
        },
      }),
  );
