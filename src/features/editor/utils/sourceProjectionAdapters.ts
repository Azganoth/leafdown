import { Fragment, Slice, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Selection, Transaction } from "@milkdown/kit/prose/state";

import { isNonNullish } from "@/lib/predicates";

import {
  getCandidateMarksAtSelection,
  getMarkRangeAtSelection,
  type ActiveMarkRange,
} from "./marks";
import { isTextCaretSelection } from "./selections";
import {
  areProjectionMarksEqual,
  createProjectionMarkDescriptor,
  createProjectionSource,
  getProjectionReplacement,
  isProjectionMarkName,
  parseProjectionSource,
  SUPPORTED_PROJECTION_MARK_NAMES,
  type ParsedProjectionSource,
  type ProjectionMarkDescriptor,
} from "./sourceProjectionSyntax";
import { getRangeText, getTextBetween, type TextRange } from "./textRanges";

type SourceProjectionAdapterId = "mark";

export interface SourceProjectionTarget extends TextRange {
  adapterId: SourceProjectionAdapterId;
  originalContent: Slice;
  originalContentSize: number;
  originalSource: string;
}

interface MarkSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: "mark";
  marks: ProjectionMarkDescriptor[];
  originalText: string;
}

export interface SourceProjectionSessionRange extends TextRange {
  target: SourceProjectionTarget;
}

export interface SourceProjectionParseResult {
  replacement: Slice;
  replacementSize: number;
  source: string;
}

export interface SourceProjectionPresentation {
  closingLength: number;
  contentClassName: string | null;
  openingLength: number;
  sourceTypes: string[];
}

export interface SourceProjectionInsertionCandidate extends TextRange {
  selectionOffset: number;
  target: SourceProjectionTarget;
}

export interface SourceProjectionAdapter {
  id: SourceProjectionAdapterId;
  createEnterTransaction: (state: EditorState, target: SourceProjectionTarget) => Transaction;
  findTarget: (state: EditorState) => SourceProjectionTarget | null;
  getPresentation: (target: SourceProjectionTarget, source: string) => SourceProjectionPresentation;
  mapSelectionFromSource: (
    selection: Selection,
    session: SourceProjectionSessionRange,
    parsed: SourceProjectionParseResult,
  ) => { anchor: number; head: number };
  mapSelectionToSource: (
    selection: Selection,
    target: SourceProjectionTarget,
  ) => { anchor: number; head: number };
  parseSource: (state: EditorState, source: string) => SourceProjectionParseResult;
  restoreCleanTarget: (state: EditorState, session: SourceProjectionSessionRange) => Transaction;
}

interface ActiveProjectionRange extends ActiveMarkRange {
  marks: ProjectionMarkDescriptor[];
}

const createTextSlice = (
  state: EditorState,
  text: string,
  marks: ProjectionMarkDescriptor[] = [],
) => {
  if (!text) {
    return Slice.empty;
  }

  const node = state.schema.text(
    text,
    marks.map((mark) => state.schema.marks[mark.markName].create(mark.attrs)),
  );

  return new Slice(Fragment.from(node), 0, 0);
};

export const createLiteralSourceProjectionSlice = (state: EditorState, text: string) =>
  createTextSlice(state, text);

const createMarkSourceProjectionTarget = (
  state: EditorState,
  range: ActiveProjectionRange,
): MarkSourceProjectionTarget => {
  const originalText = getRangeText(state.doc, range);
  const originalSource = createProjectionSource(range.marks, originalText);

  return {
    adapterId: "mark",
    from: range.from,
    marks: range.marks,
    originalContent: state.doc.slice(range.from, range.to),
    originalContentSize: range.to - range.from,
    originalSource,
    originalText,
    to: range.to,
  };
};

const createMarkSourceProjectionTargetFromSource = (
  state: EditorState,
  from: number,
  source: string,
  parsed: Extract<ParsedProjectionSource, { type: "mark" }>,
): MarkSourceProjectionTarget => ({
  adapterId: "mark",
  from,
  marks: parsed.marks,
  originalContent: createTextSlice(state, parsed.text, parsed.marks),
  originalContentSize: parsed.text.length,
  originalSource: source,
  originalText: parsed.text,
  to: from + source.length,
});

const getActiveProjectionMarkRange = (state: EditorState): ActiveProjectionRange | null => {
  const { selection } = state;

  if (!isTextCaretSelection(selection)) {
    return null;
  }

  const candidateMarks = getCandidateMarksAtSelection(state);

  for (const markName of SUPPORTED_PROJECTION_MARK_NAMES) {
    const markType = state.schema.marks[markName];
    if (!markType) {
      continue;
    }

    const activeMark = candidateMarks.find((mark) => mark.type === markType) ?? null;

    if (!activeMark) {
      continue;
    }

    const range = getMarkRangeAtSelection(state, activeMark);
    if (!range) {
      continue;
    }

    const marks = getProjectionMarksForRange(state, range);

    if (marks) {
      return {
        ...range,
        marks,
      };
    }
  }

  return null;
};

const getProjectionMarksForRange = (
  state: EditorState,
  range: ActiveMarkRange,
): ProjectionMarkDescriptor[] | null => {
  let supportedMarks: ProjectionMarkDescriptor[] | null = null;

  state.doc.nodesBetween(range.from, range.to, (node) => {
    if (node.isText) {
      const projectionMarks = getProjectionMarksFromTextNode(node);

      if (
        !projectionMarks.length ||
        !projectionMarks.some((mark) => mark.markName === range.mark.type.name) ||
        (supportedMarks && !areProjectionMarksEqual(supportedMarks, projectionMarks))
      ) {
        supportedMarks = null;
        return false;
      }

      supportedMarks ??= projectionMarks;

      return true;
    }

    if (node.isInline) {
      supportedMarks = null;
      return false;
    }

    return true;
  });

  return supportedMarks;
};

const getProjectionMarksFromTextNode = (node: ProseMirrorNode): ProjectionMarkDescriptor[] => {
  const inlineCode = node.marks.find((mark) => mark.type.name === "inlineCode");

  if (inlineCode) {
    return node.marks.length === 1
      ? [createProjectionMarkDescriptor("inlineCode", inlineCode.attrs)]
      : [];
  }

  if (node.marks.some((mark) => !isProjectionMarkName(mark.type.name))) {
    return [];
  }

  return SUPPORTED_PROJECTION_MARK_NAMES.flatMap((markName) => {
    const mark = node.marks.find((candidateMark) => candidateMark.type.name === markName);

    if (!mark) {
      return [];
    }

    return [createProjectionMarkDescriptor(markName, mark.attrs)];
  });
};

const isPlainTextRange = (state: EditorState, from: number, to: number) => {
  let isPlain = true;

  state.doc.nodesBetween(from, to, (node) => {
    if (node.isText) {
      if (node.marks.length > 0) {
        isPlain = false;
        return false;
      }

      return true;
    }

    if (node.isInline) {
      isPlain = false;
      return false;
    }

    return true;
  });

  return isPlain;
};

export const getSourceProjectionInsertionCandidate = (
  state: EditorState,
  position: number,
  markerText: string,
): SourceProjectionInsertionCandidate | null => {
  if (markerText.length !== 1) {
    return null;
  }

  const $position = state.doc.resolve(position);

  if (!$position.parent.isTextblock) {
    return null;
  }

  const textAfter = getTextBetween(
    $position.parent,
    $position.parentOffset,
    $position.parent.content.size,
  );
  const closingMarkerIndex = textAfter.indexOf(markerText);

  if (closingMarkerIndex <= 0) {
    return null;
  }

  const source = `${markerText}${textAfter.slice(0, closingMarkerIndex + markerText.length)}`;
  const parsed = parseProjectionSource(source);

  if (parsed.type !== "mark") {
    return null;
  }

  const to = position + source.length - markerText.length;

  if (!isPlainTextRange(state, position, to)) {
    return null;
  }

  return {
    from: position,
    selectionOffset: markerText.length,
    target: createMarkSourceProjectionTargetFromSource(state, position, source, parsed),
    to,
  };
};

const getProjectionContentClassName = (marks: ProjectionMarkDescriptor[]) =>
  [
    "leafdown-source-projection__content",
    marks.some((mark) => mark.markName === "strong") &&
      "leafdown-source-projection__content--strong",
    marks.some((mark) => mark.markName === "emphasis") &&
      "leafdown-source-projection__content--emphasis",
    marks.some((mark) => mark.markName === "strike_through") &&
      "leafdown-source-projection__content--strikethrough",
    marks.some((mark) => mark.markName === "inlineCode") &&
      "leafdown-source-projection__content--inline-code",
    marks.some((mark) => mark.markName === "link") && "leafdown-source-projection__content--link",
  ]
    .filter(isNonNullish)
    .join(" ");

const getMarkSourceProjectionTarget = (
  target: SourceProjectionTarget,
): MarkSourceProjectionTarget => {
  if (target.adapterId !== "mark") {
    throw new Error(`Expected a mark source-projection target, received '${target.adapterId}'`);
  }

  return target as MarkSourceProjectionTarget;
};

const mapSelectionToSourcePosition = (position: number, target: MarkSourceProjectionTarget) => {
  if (position < target.from) {
    return position;
  }

  if (position > target.to) {
    return target.from + target.originalSource.length + (position - target.to);
  }

  const sourceTextOffset = target.originalSource.indexOf(target.originalText);
  const contentOffset = Math.min(Math.max(position - target.from, 0), target.originalContentSize);

  return target.from + sourceTextOffset + contentOffset;
};

const mapSelectionFromSourcePosition = (
  position: number,
  session: SourceProjectionSessionRange,
  parsed: ParsedProjectionSource,
  replacementSize: number,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return session.from + replacementSize + (position - session.to);
  }

  const sourceOffset = position - session.from;

  if (parsed.type === "literal") {
    return session.from + Math.min(Math.max(sourceOffset, 0), replacementSize);
  }

  if (sourceOffset <= parsed.opening.length) {
    return session.from;
  }

  const closingStart = session.to - session.from - parsed.closing.length;

  if (sourceOffset >= closingStart) {
    return session.from + replacementSize;
  }

  return (
    session.from + Math.min(Math.max(sourceOffset - parsed.opening.length, 0), replacementSize)
  );
};

const MARK_SOURCE_PROJECTION_ADAPTER: SourceProjectionAdapter = {
  id: "mark",
  createEnterTransaction: (state, target) => {
    const markTarget = getMarkSourceProjectionTarget(target);
    const contentOffset = markTarget.originalSource.indexOf(markTarget.originalText);
    const closingSource = markTarget.originalSource.slice(
      contentOffset + markTarget.originalText.length,
    );
    const openingSource = markTarget.originalSource.slice(0, contentOffset);

    return state.tr
      .removeMark(markTarget.from, markTarget.to)
      .replaceWith(markTarget.to, markTarget.to, state.schema.text(closingSource))
      .replaceWith(markTarget.from, markTarget.from, state.schema.text(openingSource));
  },
  findTarget: (state) => {
    const range = getActiveProjectionMarkRange(state);

    return range ? createMarkSourceProjectionTarget(state, range) : null;
  },
  getPresentation: (target, source) => {
    const markTarget = getMarkSourceProjectionTarget(target);
    const parsed = parseProjectionSource(source);
    const marks = parsed.type === "mark" ? parsed.marks : markTarget.marks;

    return {
      closingLength: parsed.type === "mark" ? parsed.closing.length : 0,
      contentClassName: parsed.type === "mark" ? getProjectionContentClassName(marks) : null,
      openingLength: parsed.type === "mark" ? parsed.opening.length : 0,
      sourceTypes: marks.map((mark) => mark.markName),
    };
  },
  mapSelectionFromSource: (selection, session, result) => {
    const parsed = parseProjectionSource(result.source);

    return {
      anchor: mapSelectionFromSourcePosition(
        selection.anchor,
        session,
        parsed,
        result.replacementSize,
      ),
      head: mapSelectionFromSourcePosition(selection.head, session, parsed, result.replacementSize),
    };
  },
  mapSelectionToSource: (selection, target) => {
    const markTarget = getMarkSourceProjectionTarget(target);

    return {
      anchor: mapSelectionToSourcePosition(selection.anchor, markTarget),
      head: mapSelectionToSourcePosition(selection.head, markTarget),
    };
  },
  parseSource: (state, source) => {
    const parsed = parseProjectionSource(source);
    const replacement = getProjectionReplacement(parsed);
    const replacementSlice =
      replacement.type === "marked"
        ? createTextSlice(state, replacement.text, replacement.marks)
        : createTextSlice(state, replacement.text);

    return {
      replacement: replacementSlice,
      replacementSize: replacement.text.length,
      source,
    };
  },
  restoreCleanTarget: (state, session) => {
    const target = getMarkSourceProjectionTarget(session.target);
    const contentOffset = target.originalSource.indexOf(target.originalText);
    const closingLength = target.originalSource.length - contentOffset - target.originalText.length;
    const transaction = state.tr
      .delete(session.to - closingLength, session.to)
      .delete(session.from, session.from + contentOffset);
    const restoredTo = session.from + target.originalContentSize;

    if (session.from < restoredTo) {
      for (const mark of target.marks) {
        transaction.addMark(
          session.from,
          restoredTo,
          state.schema.marks[mark.markName].create(mark.attrs),
        );
      }
    }

    if (!transaction.doc.slice(session.from, restoredTo).eq(target.originalContent)) {
      transaction.replace(session.from, restoredTo, target.originalContent);
    }

    return transaction;
  },
};

const SOURCE_PROJECTION_ADAPTERS = [MARK_SOURCE_PROJECTION_ADAPTER] as const;

export const findSourceProjectionTarget = (state: EditorState) => {
  for (const adapter of SOURCE_PROJECTION_ADAPTERS) {
    const target = adapter.findTarget(state);

    if (target) {
      return target;
    }
  }

  return null;
};

export const getSourceProjectionAdapter = (target: SourceProjectionTarget) => {
  const adapter = SOURCE_PROJECTION_ADAPTERS.find(
    (candidateAdapter) => candidateAdapter.id === target.adapterId,
  );

  if (!adapter) {
    throw new Error(`No source-projection adapter is registered for '${target.adapterId}'`);
  }

  return adapter;
};
