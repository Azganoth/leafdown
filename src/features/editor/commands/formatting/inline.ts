import type { MarkType } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { isNonNullish } from "@/lib/predicates";

import {
  finalizeInlineSourceProjection,
  hasActiveInlineSourceProjection,
} from "../../plugins/inlineSourceProjection";
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

const removeOtherInlineMarks = (
  state: EditorState,
  range: TextRange,
  preservedMarkType: MarkType,
) => {
  const tr = state.tr;

  for (const markType of getClearableMarkTypes(state)) {
    if (markType !== preservedMarkType) {
      tr.removeMark(range.from, range.to, markType);
    }
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
  if (hasActiveInlineSourceProjection(view.state)) {
    finalizeInlineSourceProjection(view);
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
    tr.removeMark(range.from, range.to, markType);
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
  if (hasActiveInlineSourceProjection(view.state)) {
    finalizeInlineSourceProjection(view);
  }

  const { selection } = view.state;
  const markTypes = getClearableMarkTypes(view.state);

  if (!selection.empty) {
    const tr = view.state.tr;

    for (const markType of markTypes) {
      tr.removeMark(selection.from, selection.to, markType);
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
  if (hasActiveInlineSourceProjection(state)) {
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
