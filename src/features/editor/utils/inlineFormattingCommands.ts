import type { Mark, MarkType } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { AppCommandId } from "@/features/commands/types";

import { getTextWordRangeAtSelection } from "./editorCommandState";

type InlineFormatCommandId =
  | "format.strong"
  | "format.emphasis"
  | "format.strikethrough"
  | "format.inlineCode"
  | "insert.link";

interface TextRange {
  from: number;
  to: number;
}

interface ActiveMarkRange extends TextRange {
  mark: Mark;
}

const inlineFormatMarkNames = {
  "format.strong": "strong",
  "format.emphasis": "emphasis",
  "format.strikethrough": "strike_through",
  "format.inlineCode": "inlineCode",
  "insert.link": "link",
} satisfies Record<InlineFormatCommandId, string>;

const clearableInlineMarkNames = [
  "strong",
  "emphasis",
  "strike_through",
  "inlineCode",
  "link",
] as const;

const getMarkType = (state: EditorState, markName: string) => state.schema.marks[markName] ?? null;

const getClearableMarkTypes = (state: EditorState) =>
  clearableInlineMarkNames
    .map((markName) => getMarkType(state, markName))
    .filter((markType): markType is MarkType => Boolean(markType));

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

const insertEmptyLinkMarker = (view: EditorView) => {
  const { selection } = view.state;

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false;
  }

  const position = selection.from;
  const tr = view.state.tr.insertText("[]()", position, position);

  tr.setSelection(TextSelection.create(tr.doc, position + 1)).scrollIntoView();

  view.focus();
  view.dispatch(tr);

  return true;
};

const setStoredInlineMark = (view: EditorView, markType: MarkType) => {
  const tr = view.state.tr.addStoredMark(createMark(markType)).scrollIntoView();

  view.focus();
  view.dispatch(tr);

  return true;
};

export const runInlineFormattingCommand = (view: EditorView, commandId: AppCommandId) => {
  if (!isInlineFormatCommandId(commandId)) {
    return false;
  }

  const markType = getMarkType(view.state, inlineFormatMarkNames[commandId]);

  if (!markType) {
    return false;
  }

  const range = getInlineFormatRange(view.state);

  if (!range) {
    return commandId === "insert.link"
      ? insertEmptyLinkMarker(view)
      : setStoredInlineMark(view, markType);
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

export const clearInlineFormatting = (view: EditorView) => {
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

    const tr = view.state.tr.removeStoredMark(storedClearableMark.type).scrollIntoView();

    view.focus();
    view.dispatch(tr);

    return true;
  }

  view.focus();
  view.dispatch(
    view.state.tr
      .removeMark(activeMarkRange.from, activeMarkRange.to, activeMarkRange.mark.type)
      .scrollIntoView(),
  );

  return true;
};

export const hasClearableInlineFormatting = (state: EditorState) => {
  if (!state.selection.empty) {
    return getClearableMarkTypes(state).some((markType) =>
      rangeHasMark(state, { from: state.selection.from, to: state.selection.to }, markType),
    );
  }

  const clearableMarkTypes = getClearableMarkTypes(state);

  if ((state.storedMarks ?? []).some((mark) => clearableMarkTypes.includes(mark.type))) {
    return true;
  }

  return Boolean(getActiveClearableMarkRange(state, clearableMarkTypes));
};

const isInlineFormatCommandId = (commandId: AppCommandId): commandId is InlineFormatCommandId =>
  commandId === "format.strong" ||
  commandId === "format.emphasis" ||
  commandId === "format.strikethrough" ||
  commandId === "format.inlineCode" ||
  commandId === "insert.link";

const getActiveClearableMarkRange = (
  state: EditorState,
  clearableMarkTypes: MarkType[],
): ActiveMarkRange | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || !selection.empty) {
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

  const candidateMarks = [
    ...(state.storedMarks ?? []),
    ...selection.$from.marks(),
    ...(selection.$from.nodeBefore?.marks ?? []),
    ...(selection.$from.nodeAfter?.marks ?? []),
  ];

  return candidateMarks.find((mark) => clearableMarkTypes.includes(mark.type)) ?? null;
};

const getMarkRangeAtSelection = (state: EditorState, mark: Mark): ActiveMarkRange | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection)) {
    return null;
  }

  const { $from } = selection;
  const parent = $from.parent;
  const cursorOffset = $from.parentOffset;
  const markedRanges: TextRange[] = [];

  parent.forEach((node, offset) => {
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
    from: $from.start() + from,
    mark,
    to: $from.start() + to,
  };
};
