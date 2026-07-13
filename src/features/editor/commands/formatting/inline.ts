import type { MarkType } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { isNonNullish } from "@/lib/predicates";

import {
  finalizeSourceProjection,
  hasActiveSourceProjection,
} from "../../plugins/sourceProjection";
import {
  getCandidateMarksAtSelection,
  getMarkRangeAtSelection,
  type ActiveMarkRange,
} from "../../utils/marks";
import { getMarkType } from "../../utils/milkdown";
import { isTextCaretSelection } from "../../utils/selections";
import { getTextWordRangeAtSelection, type TextRange } from "../../utils/textRanges";

const getClearableMarkTypes = (state: EditorState) =>
  CLEARABLE_INLINE_MARK_NAMES.map((markName) => getMarkType(state, markName)).filter(isNonNullish);

const createMark = (markType: MarkType) =>
  markType.name === "link" ? markType.create({ href: "", title: null }) : markType.create();

const rangeHasMark = (state: EditorState, { from, to }: TextRange, markType: MarkType) =>
  from < to && state.doc.rangeHasMark(from, to, markType);

const getWhitespaceSafeMarkRemovalRange = (
  state: EditorState,
  range: TextRange,
  markType: MarkType,
): TextRange => {
  let { from, to } = range;
  const nodeAfterFrom = state.doc.resolve(from).nodeAfter;
  const nodeBeforeTo = state.doc.resolve(to).nodeBefore;
  const startsWithMark =
    nodeAfterFrom?.isText === true && nodeAfterFrom.marks.some((mark) => mark.type === markType);
  const endsWithMark =
    nodeBeforeTo?.isText === true && nodeBeforeTo.marks.some((mark) => mark.type === markType);

  while (startsWithMark && from > 0) {
    const nodeBefore = state.doc.resolve(from).nodeBefore;

    if (!nodeBefore?.isText || !nodeBefore.marks.some((mark) => mark.type === markType)) {
      break;
    }

    const text = nodeBefore.text ?? "";
    const whitespaceLength = text.length - text.trimEnd().length;

    if (whitespaceLength === 0) {
      break;
    }

    from -= whitespaceLength;
  }

  while (endsWithMark && to < state.doc.content.size) {
    const nodeAfter = state.doc.resolve(to).nodeAfter;

    if (!nodeAfter?.isText || !nodeAfter.marks.some((mark) => mark.type === markType)) {
      break;
    }

    const text = nodeAfter.text ?? "";
    const whitespaceLength = text.length - text.trimStart().length;

    if (whitespaceLength === 0) {
      break;
    }

    to += whitespaceLength;
  }

  return { from, to };
};

const removeOtherInlineMarks = (
  state: EditorState,
  range: TextRange,
  preservedMarkType: MarkType,
) => {
  const tr = state.tr;

  for (const markType of getClearableMarkTypes(state)) {
    if (markType === preservedMarkType || !rangeHasMark(state, range, markType)) {
      continue;
    }

    const removalRange = getWhitespaceSafeMarkRemovalRange(state, range, markType);

    tr.removeMark(removalRange.from, removalRange.to, markType);
  }

  return tr;
};

const getInlineFormatRange = (state: EditorState): TextRange | null => {
  const { selection } = state;

  if (!selection.empty) {
    return {
      from: selection.from,
      to: selection.to,
    };
  }

  return getTextWordRangeAtSelection(state);
};

const setStoredInlineMark = (view: EditorView, markType: MarkType) => {
  const tr = view.state.tr.addStoredMark(createMark(markType));

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

type InlineMarkName = "emphasis" | "inlineCode" | "strike_through" | "strong";

const getActiveClearableMarkRange = (
  state: EditorState,
  clearableMarkTypes: MarkType[],
): ActiveMarkRange | null => {
  const { selection } = state;

  if (!isTextCaretSelection(selection)) {
    return null;
  }

  const activeMark = getActiveClearableMark(state, clearableMarkTypes);

  if (!activeMark) {
    return null;
  }

  return getMarkRangeAtSelection(state, activeMark);
};

const getActiveClearableMark = (state: EditorState, clearableMarkTypes: MarkType[]) => {
  const { selection } = state;

  if (!(selection instanceof TextSelection)) {
    return null;
  }

  return (
    getCandidateMarksAtSelection(state).find((mark) => clearableMarkTypes.includes(mark.type)) ??
    null
  );
};

const CLEARABLE_INLINE_MARK_NAMES = [
  "strong",
  "emphasis",
  "strike_through",
  "inlineCode",
  "link",
] as const;

const toggleInlineFormatting = (view: EditorView, markName: InlineMarkName) => {
  if (hasActiveSourceProjection(view.state)) {
    finalizeSourceProjection(view);
  }

  const markType = getMarkType(view.state, markName);

  if (!markType) {
    return false;
  }

  const range = getInlineFormatRange(view.state);

  if (!range) {
    return setStoredInlineMark(view, markType);
  }

  const shouldRemove = rangeHasMark(view.state, range, markType);
  const tr =
    markType.name === "inlineCode" && !shouldRemove
      ? removeOtherInlineMarks(view.state, range, markType)
      : view.state.tr;

  if (shouldRemove) {
    const removalRange = getWhitespaceSafeMarkRemovalRange(view.state, range, markType);

    tr.removeMark(removalRange.from, removalRange.to, markType);
  } else {
    tr.addMark(range.from, range.to, createMark(markType));
  }

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

/* Commands */

export const toggleStrong = (view: EditorView) => toggleInlineFormatting(view, "strong");

export const toggleEmphasis = (view: EditorView) => toggleInlineFormatting(view, "emphasis");

export const toggleStrikethrough = (view: EditorView) =>
  toggleInlineFormatting(view, "strike_through");

export const toggleInlineCode = (view: EditorView) => toggleInlineFormatting(view, "inlineCode");

export const clearInlineFormat = (view: EditorView) => {
  if (hasActiveSourceProjection(view.state)) {
    finalizeSourceProjection(view);
  }

  const { selection } = view.state;
  const markTypes = getClearableMarkTypes(view.state);

  if (!selection.empty) {
    const tr = view.state.tr;
    const range = { from: selection.from, to: selection.to };

    for (const markType of markTypes) {
      if (!rangeHasMark(view.state, range, markType)) {
        continue;
      }

      const removalRange = getWhitespaceSafeMarkRemovalRange(view.state, range, markType);

      tr.removeMark(removalRange.from, removalRange.to, markType);
    }

    view.focus();
    view.dispatch(tr.scrollIntoView());

    return true;
  }

  const activeMarkRange = getActiveClearableMarkRange(view.state, markTypes);

  if (!activeMarkRange) {
    const storedMarks = view.state.storedMarks ?? [];
    const storedClearableMark = storedMarks.find((mark) => markTypes.includes(mark.type));

    if (!storedClearableMark) {
      return false;
    }

    const tr = view.state.tr.removeStoredMark(storedClearableMark.type);

    view.focus();
    view.dispatch(tr.scrollIntoView());

    return true;
  }

  const tr = view.state.tr.removeMark(
    activeMarkRange.from,
    activeMarkRange.to,
    activeMarkRange.mark.type,
  );

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

/* State */

export const canClearInlineFormat = (state: EditorState) => {
  if (hasActiveSourceProjection(state)) {
    return true;
  }

  if (!state.selection.empty) {
    return getClearableMarkTypes(state).some((markType) =>
      rangeHasMark(state, { from: state.selection.from, to: state.selection.to }, markType),
    );
  }

  const clearableMarkTypes = getClearableMarkTypes(state);

  if ((state.storedMarks ?? []).some((mark) => clearableMarkTypes.includes(mark.type))) {
    return true;
  }

  return getActiveClearableMarkRange(state, clearableMarkTypes) !== null;
};
