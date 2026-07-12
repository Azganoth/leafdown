import type { Fragment, Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";

import { isTextCaretSelection } from "./selections";

export interface TextRange {
  from: number;
  to: number;
}

interface TextBlockSelectionInfo {
  offset: number;
  start: number;
  text: string;
}

const isWordCharacter = (value: string) => /^[\p{L}\p{N}_]$/u.test(value);

export const getTextBetween = (source: Fragment | ProseMirrorNode, from: number, to: number) =>
  source.textBetween(from, to, "\n", "\n");

export const getRangeText = (source: Fragment | ProseMirrorNode, { from, to }: TextRange) =>
  getTextBetween(source, from, to);

const getTextBlockSelectionInfoAtPosition = (
  state: EditorState,
  position: number,
): TextBlockSelectionInfo | null => {
  const $position = state.doc.resolve(position);
  const textBlock = $position.parent;

  if (!textBlock.isTextblock) {
    return null;
  }

  return {
    offset: $position.parentOffset,
    start: $position.start(),
    text: getTextBetween(textBlock, 0, textBlock.content.size),
  };
};

const getTextBlockSelectionInfo = (state: EditorState): TextBlockSelectionInfo | null => {
  const { selection } = state;

  return isTextCaretSelection(selection)
    ? getTextBlockSelectionInfoAtPosition(state, selection.from)
    : null;
};

const getTextWordRange = (info: TextBlockSelectionInfo | null): TextRange | null => {
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

export const getTextWordRangeAtPosition = (
  state: EditorState,
  position: number,
): TextRange | null => getTextWordRange(getTextBlockSelectionInfoAtPosition(state, position));

export const getTextWordRangeAtSelection = (state: EditorState): TextRange | null => {
  const { selection } = state;

  if (!isTextCaretSelection(selection)) {
    return null;
  }

  return getTextWordRangeAtPosition(state, selection.from);
};

export const getTextWordRangeBeforeSelection = (state: EditorState): TextRange | null => {
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

export const getTextWordRangeAfterSelection = (state: EditorState): TextRange | null => {
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
