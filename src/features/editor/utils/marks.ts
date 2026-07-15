import type { Mark } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";

import type { TextRange } from "./textRanges";

export interface ActiveMarkRange extends TextRange {
  mark: Mark;
}

export const getCandidateMarksAtPosition = (state: EditorState, position: number): Mark[] => {
  const $position = state.doc.resolve(position);

  return [
    ...$position.marks(),
    ...($position.nodeBefore?.marks ?? []),
    ...($position.nodeAfter?.marks ?? []),
  ];
};

export const getCandidateMarksAtSelection = (state: EditorState): Mark[] => {
  const { selection } = state;

  if (!(selection instanceof TextSelection)) {
    return [];
  }

  return [...(state.storedMarks ?? []), ...getCandidateMarksAtPosition(state, selection.from)];
};

export const getMarkRangeAtPosition = (
  state: EditorState,
  position: number,
  mark: Mark,
): ActiveMarkRange | null => {
  const $position = state.doc.resolve(position);
  const cursorOffset = $position.parentOffset;
  const markedRanges: TextRange[] = [];

  $position.parent.forEach((node, offset) => {
    if (!mark.isInSet(node.marks)) {
      return;
    }

    markedRanges.push({
      from: offset,
      to: offset + node.nodeSize,
    });
  });

  const activeRange = markedRanges.find(
    (range) => range.from <= cursorOffset && cursorOffset <= range.to,
  );

  if (!activeRange) {
    return null;
  }

  let from = activeRange.from;
  let to = activeRange.to;

  for (let index = markedRanges.indexOf(activeRange) - 1; index >= 0; index -= 1) {
    const range = markedRanges[index];

    if (range.to !== from) {
      break;
    }

    from = range.from;
  }

  for (let index = markedRanges.indexOf(activeRange) + 1; index < markedRanges.length; index += 1) {
    const range = markedRanges[index];

    if (range.from !== to) {
      break;
    }

    to = range.to;
  }

  return {
    from: $position.start() + from,
    mark,
    to: $position.start() + to,
  };
};

export const getMarkRangeAtSelection = (state: EditorState, mark: Mark): ActiveMarkRange | null => {
  const { selection } = state;

  return selection instanceof TextSelection
    ? getMarkRangeAtPosition(state, selection.from, mark)
    : null;
};
