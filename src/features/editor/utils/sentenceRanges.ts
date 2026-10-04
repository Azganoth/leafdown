import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";

import { FOOTNOTE_DEFINITION_LABEL_NODE_NAME } from "./footnoteDefinitionLabel";
import {
  DEFINITION_DESTINATION_NODE_NAME,
  DEFINITION_LABEL_NODE_NAME,
  DEFINITION_TITLE_NODE_NAME,
} from "./referenceLinkMarkdown";
import type { TextRange } from "./textRanges";

// Boundaries follow the runtime's Unicode rules rather than the interface language, so the same
// document segments the same way whatever language Leafdown is shown in.
const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });

// Label and definition fields are Markdown metadata the reader never sees as prose.
const NON_PROSE_TEXTBLOCK_NAMES = new Set([
  FOOTNOTE_DEFINITION_LABEL_NODE_NAME,
  DEFINITION_LABEL_NODE_NAME,
  DEFINITION_DESTINATION_NODE_NAME,
  DEFINITION_TITLE_NODE_NAME,
]);

const isProseTextblock = (node: ProseMirrorNode) =>
  node.isTextblock && !node.type.spec.code && !NON_PROSE_TEXTBLOCK_NAMES.has(node.type.name);

const isRangeInside = (range: TextRange, bounds: TextRange) =>
  range.from >= bounds.from && range.to <= bounds.to;

const getSentenceEditableSelection = (
  state: EditorState,
  bounds: TextRange | null,
): TextSelection | null => {
  const { selection } = state;

  if (
    !(selection instanceof TextSelection) ||
    !isProseTextblock(selection.$anchor.parent) ||
    !isProseTextblock(selection.$head.parent) ||
    (bounds !== null && !isRangeInside(selection, bounds))
  ) {
    return null;
  }

  return selection;
};

const HARD_BREAK_NODE_NAME = "hardbreak";

const isSoftBreak = (node: ProseMirrorNode) =>
  node.type.name === HARD_BREAK_NODE_NAME && node.attrs.isInline === true;

const isRunContent = (node: ProseMirrorNode) => node.isText || isSoftBreak(node);

// A run is the text between the textblock's edges and any other inline node, which keeps marks,
// links, and soft wraps inside the run while hard breaks and atoms divide it.
const getTextRuns = (textblock: ProseMirrorNode, start: number) => {
  const runs: TextRange[] = [];
  let runFrom: number | null = null;
  let position = start;

  for (let index = 0; index < textblock.childCount; index += 1) {
    const child = textblock.child(index);

    if (isRunContent(child)) {
      runFrom ??= position;
    } else if (runFrom !== null) {
      runs.push({ from: runFrom, to: position });
      runFrom = null;
    }

    position += child.nodeSize;
  }

  if (runFrom !== null) {
    runs.push({ from: runFrom, to: position });
  }

  return runs;
};

const findTextRun = (state: EditorState, { from, to }: TextRange) => {
  const $from = state.doc.resolve(from);

  return (
    getTextRuns($from.parent, $from.start()).find((run) => run.from <= from && to <= run.to) ?? null
  );
};

const clampRun = (run: TextRange, bounds: TextRange | null): TextRange =>
  bounds === null
    ? run
    : { from: Math.max(run.from, bounds.from), to: Math.min(run.to, bounds.to) };

const LINE_ENDING_PATTERN = /[\n\r]/gu;

// A soft wrap, whether a break node or a line ending in projected source, would otherwise read as
// a Unicode paragraph separator. One space per position keeps every offset in place.
const getRunText = (state: EditorState, { from, to }: TextRange) =>
  state.doc.textBetween(from, to, undefined, " ").replace(LINE_ENDING_PATTERN, " ");

const getSentenceBoundaryOffsets = (text: string) => {
  const offsets = [0];

  for (const { index, segment } of sentenceSegmenter.segment(text)) {
    offsets.push(index + segment.length);
  }

  return offsets;
};

/**
 * The sentences a caret or selection stands in, widened to their boundaries within one text run and,
 * while source projection is active, within the projected source. A caret on a boundary reads the
 * sentence after it, except at the end of the run, where it reads the one it ends.
 */
export const getSentenceRange = (
  state: EditorState,
  bounds: TextRange | null,
): TextRange | null => {
  const selection = getSentenceEditableSelection(state, bounds);
  const textRun = selection && findTextRun(state, selection);

  if (!selection || !textRun) {
    return null;
  }

  const run = clampRun(textRun, bounds);
  const length = run.to - run.from;

  if (length === 0) {
    return null;
  }

  const offsets = getSentenceBoundaryOffsets(getRunText(state, run));
  const fromOffset = selection.from - run.from;
  const toOffset = selection.to - run.from;
  const startLimit = selection.empty && fromOffset === length ? fromOffset - 1 : fromOffset;
  const start = offsets.findLast((offset) => offset <= startLimit) ?? 0;
  const end = offsets.find((offset) => offset > start && offset >= toOffset) ?? length;

  return { from: run.from + start, to: run.from + end };
};
