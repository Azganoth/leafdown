import { Fragment, Mark, Slice, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Selection, Transaction } from "@milkdown/kit/prose/state";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Parser, RemarkParser, Serializer } from "@milkdown/kit/transformer";

import { isNonNullish } from "@/lib/predicates";

import { getCandidateMarksAtSelection } from "./marks";
import { FOOTNOTE_REFERENCE_NODE_NAME } from "./sourceProjectionFootnoteReferenceSyntax";
import {
  createMarkedFragmentSourceStructure,
  mapMarkedFragmentDocumentOffsetToSource,
  mapMarkedFragmentSourceOffsetToDocument,
  parseMarkedFragmentSource,
  serializeMarkedFragmentSource,
  type MarkedFragmentSourceMap,
} from "./sourceProjectionMarkedFragmentSyntax";
import {
  createProjectionMarkDescriptor,
  createProjectionSource,
  getProjectionDelimiterBounds,
  getProjectionReplacement,
  getProjectionSourceContentBounds,
  isProjectionMarkerText,
  isProjectionMarkName,
  normalizeProjectionSourceAfterEdit,
  parseProjectionSource,
  SUPPORTED_PROJECTION_MARK_NAMES,
  type ParsedProjectionSource,
  type ProjectionDelimiterSide,
  type ProjectionEditContext,
  type ProjectionEditKind,
  type ProjectionMarkDescriptor,
} from "./sourceProjectionSyntax";
import { getRangeText, getTextBetween, type TextRange } from "./textRanges";

export interface SourceProjectionTarget extends TextRange {
  adapterId: string;
  originalContent: Slice;
  originalContentSize: number;
  originalSource: string;
}

interface MarkSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: "mark";
  hasFootnoteReferences: boolean;
  marks: ProjectionMarkDescriptor[];
  originalText: string;
  sourceMap: MarkedFragmentSourceMap | null;
}

interface MarkSourceProjectionAdapterDependencies {
  parser: Parser;
  remark: RemarkParser;
  serializer: Serializer;
}

export interface SourceProjectionSessionRange extends TextRange {
  target: SourceProjectionTarget;
}

export interface SourceProjectionParseResult {
  replacement: Slice;
  replacementSize: number;
  source: string;
}

export interface SourceProjectionEdit extends TextRange {
  text: string;
}

export interface SourceProjectionEditResult {
  selectionOffset: number;
  source: string;
}

export interface SourceProjectionPresentationSpan extends TextRange {
  className: string;
}

export interface SourceProjectionPresentation {
  sourceTypes: string[];
  spans: SourceProjectionPresentationSpan[];
}

export interface SourceProjectionInsertionCandidate extends TextRange {
  selectionOffset: number;
  target: SourceProjectionTarget;
}

export interface SourceProjectionAdapter {
  id: string;
  applyEdit?: (source: string, edit: SourceProjectionEdit) => SourceProjectionEditResult;
  createEnterTransaction: (state: EditorState, target: SourceProjectionTarget) => Transaction;
  findInsertionCandidate?: (
    state: EditorState,
    position: number,
    text: string,
  ) => SourceProjectionInsertionCandidate | null;
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
  parseSource: (
    state: EditorState,
    source: string,
    target: SourceProjectionTarget,
  ) => SourceProjectionParseResult;
  restoreCleanTarget: (state: EditorState, session: SourceProjectionSessionRange) => Transaction;
  shouldHandleTextInput?: (source: string, edit: SourceProjectionEdit) => boolean;
}

export interface SourceProjectionTargetMatch {
  adapter: SourceProjectionAdapter;
  target: SourceProjectionTarget;
}

export interface SourceProjectionInsertionMatch {
  adapter: SourceProjectionAdapter;
  candidate: SourceProjectionInsertionCandidate;
}

interface ActiveProjectionRange extends TextRange {
  marks: ProjectionMarkDescriptor[];
}

interface ProjectionMarkSegment extends ActiveProjectionRange {
  documentMarks: readonly Mark[];
  leadingWhitespaceLength: number;
  trailingWhitespaceLength: number;
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

export const applyLiteralSourceProjectionEdit = (
  source: string,
  { from, text, to }: SourceProjectionEdit,
): SourceProjectionEditResult => {
  const normalizedFrom = Math.min(Math.max(from, 0), source.length);
  const normalizedTo = Math.min(Math.max(to, normalizedFrom), source.length);

  return {
    selectionOffset: normalizedFrom + text.length,
    source: `${source.slice(0, normalizedFrom)}${text}${source.slice(normalizedTo)}`,
  };
};

const createMarkSourceProjectionTarget = (
  state: EditorState,
  range: ActiveProjectionRange,
  serializer?: Serializer,
): MarkSourceProjectionTarget => {
  const originalContent = state.doc.slice(range.from, range.to);
  const originalText = getRangeText(state.doc, range);
  const serialized = serializer
    ? serializeMarkedFragmentSource(state, serializer, originalContent.content, range.marks)
    : null;
  const originalSource = serialized?.source ?? createProjectionSource(range.marks, originalText);

  return {
    adapterId: "mark",
    from: range.from,
    hasFootnoteReferences: serialized?.hasFootnoteReferences ?? false,
    marks: range.marks,
    originalContent,
    originalContentSize: range.to - range.from,
    originalSource,
    originalText,
    sourceMap: serialized?.map ?? null,
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
  hasFootnoteReferences: false,
  marks: parsed.marks,
  originalContent: createTextSlice(state, parsed.text, parsed.marks),
  originalContentSize: parsed.text.length,
  originalSource: source,
  originalText: parsed.text,
  sourceMap: null,
  to: from + source.length,
});

const getActiveProjectionMarkRange = (
  state: EditorState,
  includeFootnoteReferences = false,
): ActiveProjectionRange | null => {
  const { selection } = state;

  if (selection.$from.parent !== selection.$to.parent) {
    return null;
  }

  const segments = getProjectionMarkSegments(state, includeFootnoteReferences);

  if (selection instanceof NodeSelection) {
    const containingSegment = segments.find(
      ({ from, to }) => from <= selection.from && selection.to <= to,
    );

    return containingSegment ? getActiveProjectionRange(containingSegment) : null;
  }

  if (!(selection instanceof TextSelection)) {
    return null;
  }

  if (!selection.empty) {
    const containingSegment = segments.find(
      ({ from, to }) => from <= selection.from && selection.to <= to,
    );

    return containingSegment ? getActiveProjectionRange(containingSegment) : null;
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

    const segment = segments.find(
      ({ documentMarks, from, to }) =>
        from <= selection.from && selection.from <= to && activeMark.isInSet(documentMarks),
    );

    if (segment) {
      return getActiveProjectionRange(segment);
    }
  }

  return null;
};

const getActiveProjectionRange = ({ from, marks, to }: ProjectionMarkSegment) => ({
  from,
  marks,
  to,
});

const getProjectionMarkSegments = (
  state: EditorState,
  includeFootnoteReferences = false,
): ProjectionMarkSegment[] => {
  const { $from } = state.selection;

  if (!$from.parent.isTextblock) {
    return [];
  }

  const parentStart = $from.start();
  const segments: ProjectionMarkSegment[] = [];

  $from.parent.forEach((node, offset) => {
    const marks = getProjectionMarksFromInlineNode(node, includeFootnoteReferences);

    if (!marks.length) {
      return;
    }

    const text = node.isText ? (node.text ?? "") : "";
    const leadingWhitespaceLength = /^\s+/u.exec(text)?.[0].length ?? 0;
    const trailingWhitespaceLength = /\s+$/u.exec(text)?.[0].length ?? 0;
    const from = parentStart + offset;
    const previousSegment = segments.at(-1);

    if (previousSegment?.to === from && Mark.sameSet(previousSegment.documentMarks, node.marks)) {
      previousSegment.to = from + node.nodeSize;
      previousSegment.trailingWhitespaceLength = trailingWhitespaceLength;
      return;
    }

    segments.push({
      documentMarks: node.marks,
      from,
      leadingWhitespaceLength,
      marks,
      to: from + node.nodeSize,
      trailingWhitespaceLength,
    });
  });

  return segments.flatMap((segment) => {
    const from = segment.from + segment.leadingWhitespaceLength;
    const to = segment.to - segment.trailingWhitespaceLength;

    return from < to ? [{ ...segment, from, to }] : [];
  });
};

const getProjectionMarksFromInlineNode = (
  node: ProseMirrorNode,
  includeFootnoteReferences: boolean,
): ProjectionMarkDescriptor[] => {
  const isFootnoteReference = node.type.name === FOOTNOTE_REFERENCE_NODE_NAME;

  if (!node.isText && !(includeFootnoteReferences && isFootnoteReference)) {
    return [];
  }

  if (node.marks.some((mark) => mark.type.name === "link")) {
    return [];
  }

  const inlineCode = node.marks.find((mark) => mark.type.name === "inlineCode");

  if (inlineCode) {
    return node.isText && node.marks.length === 1
      ? [createProjectionMarkDescriptor("inlineCode", inlineCode.attrs)]
      : [];
  }

  if (node.marks.some((mark) => !isProjectionMarkName(mark.type.name))) {
    return [];
  }

  return SUPPORTED_PROJECTION_MARK_NAMES.flatMap((markName) => {
    if (isFootnoteReference && markName === "inlineCode") {
      return [];
    }

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
  ]
    .filter(isNonNullish)
    .join(" ");

const getMarkedFragmentPresentation = (
  source: string,
  marks: ProjectionMarkDescriptor[],
  map: MarkedFragmentSourceMap,
): SourceProjectionPresentation => {
  const contentClassName = getProjectionContentClassName(marks);
  const spans: SourceProjectionPresentationSpan[] = [
    {
      className: "leafdown-source-projection__marker",
      from: 0,
      to: map.contentFrom,
    },
  ];
  let hasFootnoteReference = false;

  for (const segment of map.segments) {
    if (segment.type === "text") {
      spans.push({
        className: contentClassName,
        from: segment.sourceFrom,
        to: segment.sourceTo,
      });
      continue;
    }

    hasFootnoteReference = true;
    spans.push(
      {
        className: "leafdown-source-projection__marker",
        from: segment.sourceFrom,
        to: segment.labelFrom,
      },
      {
        className: `${contentClassName} leafdown-source-projection__content--footnote-reference`,
        from: segment.labelFrom,
        to: segment.labelTo,
      },
      {
        className: "leafdown-source-projection__marker",
        from: segment.labelTo,
        to: segment.sourceTo,
      },
    );
  }

  spans.push({
    className: "leafdown-source-projection__marker",
    from: map.contentTo,
    to: source.length,
  });

  return {
    sourceTypes: [
      ...marks.map((mark) => mark.markName),
      ...(hasFootnoteReference ? ["footnote-reference"] : []),
    ],
    spans: spans.filter(({ from, to }) => from < to),
  };
};

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

  const sourceContentBounds = getProjectionSourceContentBounds(target.originalSource);
  const contentOffset = Math.min(Math.max(position - target.from, 0), target.originalContentSize);

  return target.from + sourceContentBounds.from + contentOffset;
};

const mapSelectionToMarkedFragmentSourcePosition = (
  position: number,
  target: MarkSourceProjectionTarget,
  association: -1 | 1,
) => {
  if (!target.sourceMap || position < target.from) {
    return position;
  }

  if (position > target.to) {
    return target.from + target.originalSource.length + (position - target.to);
  }

  return (
    target.from +
    mapMarkedFragmentDocumentOffsetToSource(position - target.from, target.sourceMap, association)
  );
};

const mapSelectionFromSourcePosition = (
  position: number,
  session: SourceProjectionSessionRange,
  source: string,
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

  const sourceContentBounds = getProjectionSourceContentBounds(source);

  if (sourceOffset <= sourceContentBounds.from) {
    return session.from;
  }

  if (sourceOffset >= sourceContentBounds.to) {
    return session.from + replacementSize;
  }

  return (
    session.from + Math.min(Math.max(sourceOffset - sourceContentBounds.from, 0), replacementSize)
  );
};

const mapSelectionFromMarkedFragmentSourcePosition = (
  position: number,
  session: SourceProjectionSessionRange,
  replacementSize: number,
  map: MarkedFragmentSourceMap,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return session.from + replacementSize + (position - session.to);
  }

  return session.from + mapMarkedFragmentSourceOffsetToDocument(position - session.from, map);
};

const getProjectionEditKind = ({ from, text, to }: SourceProjectionEdit): ProjectionEditKind => {
  if (text.length > 0 && from === to) {
    return "insert";
  }

  if (text.length === 0) {
    return "delete";
  }

  return "replace";
};

const getMarkProjectionEdit = (
  source: string,
  { from, text, to }: SourceProjectionEdit,
): SourceProjectionEdit & { context: ProjectionEditContext } => {
  const normalizedFrom = Math.min(Math.max(from, 0), source.length);
  const normalizedTo = Math.min(Math.max(to, normalizedFrom), source.length);
  const edit = { from: normalizedFrom, text, to: normalizedTo };
  const kind = getProjectionEditKind(edit);
  const delimiterSide = getProjectionEditedDelimiterSide(source, edit);

  if (kind === "insert" && !isActiveProjectionMarkerText(source, text)) {
    const contentBounds = getProjectionSourceContentBounds(source);
    const remappedPosition = getContentBoundaryInsertionPosition(contentBounds, normalizedFrom);

    return {
      context: { delimiterSide: null, kind },
      from: remappedPosition,
      text,
      to: remappedPosition,
    };
  }

  return {
    context: { delimiterSide, kind },
    ...edit,
  };
};

const getProjectionEditedDelimiterSide = (
  source: string,
  { from, text, to }: SourceProjectionEdit,
): ProjectionDelimiterSide | null => {
  const bounds = getProjectionDelimiterBounds(source);

  if (!bounds) {
    return null;
  }

  if (isActiveProjectionMarkerText(source, text) && from === to) {
    const isInlineCode = bounds.marker === "`";

    if (isInlineCode ? from < bounds.contentFrom : from <= bounds.contentFrom) {
      return "opening";
    }

    if (isInlineCode ? from > bounds.contentTo : from >= bounds.contentTo) {
      return "closing";
    }

    return null;
  }

  if (text.length === 0) {
    if (from < bounds.contentFrom) {
      return "opening";
    }

    if (to > bounds.contentTo) {
      return "closing";
    }
  }

  return null;
};

const isActiveProjectionMarkerText = (source: string, text: string) => {
  const bounds = getProjectionDelimiterBounds(source);

  if (!bounds) {
    return isProjectionMarkerText(text);
  }

  return text.length > 0 && Array.from(text).every((character) => character === bounds.marker);
};

const getContentBoundaryInsertionPosition = (bounds: TextRange, position: number) => {
  if (position <= bounds.from) {
    return bounds.from;
  }

  if (position >= bounds.to) {
    return bounds.to;
  }

  return position;
};

const applyMarkSourceProjectionEdit = (
  source: string,
  editInput: SourceProjectionEdit,
): SourceProjectionEditResult => {
  const edit = getMarkProjectionEdit(source, editInput);
  const editedSource = `${source.slice(0, edit.from)}${edit.text}${source.slice(edit.to)}`;
  const nextSource =
    getInlineCodeSourceAfterContentEdit(source, edit) ??
    normalizeProjectionSourceAfterEdit(editedSource, edit.context);

  return {
    selectionOffset: getProjectionEditSelectionOffset(source, edit, nextSource),
    source: nextSource,
  };
};

const getInlineCodeSourceAfterContentEdit = (
  source: string,
  edit: SourceProjectionEdit & { context: ProjectionEditContext },
) => {
  const parsed = parseProjectionSource(source);

  if (
    parsed.type !== "mark" ||
    edit.context.delimiterSide !== null ||
    !parsed.marks.some((mark) => mark.markName === "inlineCode")
  ) {
    return null;
  }

  const contentBounds = getProjectionSourceContentBounds(source);

  if (edit.from < contentBounds.from || edit.to > contentBounds.to) {
    return null;
  }

  const contentFrom = edit.from - contentBounds.from;
  const contentTo = edit.to - contentBounds.from;
  const text = `${parsed.text.slice(0, contentFrom)}${edit.text}${parsed.text.slice(contentTo)}`;

  return createProjectionSource(parsed.marks, text);
};

const getProjectionEditSelectionOffset = (
  source: string,
  edit: SourceProjectionEdit & { context: ProjectionEditContext },
  nextSource: string,
) => {
  const parsed = parseProjectionSource(source);
  const nextParsed = parseProjectionSource(nextSource);
  const isInlineCode =
    parsed.type === "mark" && parsed.marks.some((mark) => mark.markName === "inlineCode");
  const remainsInlineCode =
    nextParsed.type === "mark" && nextParsed.marks.some((mark) => mark.markName === "inlineCode");

  if (!isInlineCode || !remainsInlineCode || edit.context.delimiterSide !== null) {
    return Math.min(edit.from + edit.text.length, nextSource.length);
  }

  const contentBounds = getProjectionSourceContentBounds(source);
  const nextContentBounds = getProjectionSourceContentBounds(nextSource);
  const contentOffset = Math.min(
    Math.max(edit.from - contentBounds.from, 0),
    contentBounds.to - contentBounds.from,
  );

  return Math.min(nextContentBounds.from + contentOffset + edit.text.length, nextContentBounds.to);
};

const shouldHandleMarkTextInput = (source: string, { from, text, to }: SourceProjectionEdit) =>
  !(
    from === to &&
    text.length > 0 &&
    !isActiveProjectionMarkerText(source, text) &&
    (from === 0 || from === source.length)
  );

export const createMarkSourceProjectionAdapter = (
  dependencies?: MarkSourceProjectionAdapterDependencies,
): SourceProjectionAdapter => {
  const parser = dependencies?.parser;
  const remark = dependencies?.remark;
  const serializer = dependencies?.serializer;
  const supportsMarkedFootnoteFragments = Boolean(parser && remark && serializer);

  return {
    id: "mark",
    applyEdit: applyMarkSourceProjectionEdit,
    createEnterTransaction: (state, target) => {
      const markTarget = getMarkSourceProjectionTarget(target);

      if (markTarget.hasFootnoteReferences) {
        return state.tr.replace(
          markTarget.from,
          markTarget.to,
          createLiteralSourceProjectionSlice(state, markTarget.originalSource),
        );
      }

      const sourceContentBounds = getProjectionSourceContentBounds(markTarget.originalSource);
      const closingSource = markTarget.originalSource.slice(sourceContentBounds.to);
      const openingSource = markTarget.originalSource.slice(0, sourceContentBounds.from);

      return state.tr
        .removeMark(markTarget.from, markTarget.to)
        .replaceWith(markTarget.to, markTarget.to, state.schema.text(closingSource))
        .replaceWith(markTarget.from, markTarget.from, state.schema.text(openingSource));
    },
    findTarget: (state) => {
      const range = getActiveProjectionMarkRange(state, supportsMarkedFootnoteFragments);

      return range ? createMarkSourceProjectionTarget(state, range, serializer) : null;
    },
    findInsertionCandidate: getSourceProjectionInsertionCandidate,
    getPresentation: (target, source) => {
      const markTarget = getMarkSourceProjectionTarget(target);

      if (markTarget.hasFootnoteReferences && parser && remark) {
        const structure = createMarkedFragmentSourceStructure(source, parser, remark);

        if (structure) {
          return getMarkedFragmentPresentation(source, structure.marks, structure.map);
        }
      }

      const parsed = parseProjectionSource(source);
      const marks = parsed.type === "mark" ? parsed.marks : markTarget.marks;
      const spans: SourceProjectionPresentationSpan[] = [];

      if (parsed.type === "mark") {
        const contentBounds = getProjectionSourceContentBounds(source);

        spans.push(
          {
            className: "leafdown-source-projection__marker",
            from: 0,
            to: contentBounds.from,
          },
          {
            className: getProjectionContentClassName(marks),
            from: contentBounds.from,
            to: contentBounds.to,
          },
          {
            className: "leafdown-source-projection__marker",
            from: contentBounds.to,
            to: source.length,
          },
        );
      }

      return {
        sourceTypes: marks.map((mark) => mark.markName),
        spans,
      };
    },
    mapSelectionFromSource: (selection, session, result) => {
      const markTarget = getMarkSourceProjectionTarget(session.target);

      if (markTarget.hasFootnoteReferences && parser && remark) {
        const structure = createMarkedFragmentSourceStructure(result.source, parser, remark);

        if (structure) {
          return {
            anchor: mapSelectionFromMarkedFragmentSourcePosition(
              selection.anchor,
              session,
              result.replacementSize,
              structure.map,
            ),
            head: mapSelectionFromMarkedFragmentSourcePosition(
              selection.head,
              session,
              result.replacementSize,
              structure.map,
            ),
          };
        }
      }

      const parsed = parseProjectionSource(result.source);

      return {
        anchor: mapSelectionFromSourcePosition(
          selection.anchor,
          session,
          result.source,
          parsed,
          result.replacementSize,
        ),
        head: mapSelectionFromSourcePosition(
          selection.head,
          session,
          result.source,
          parsed,
          result.replacementSize,
        ),
      };
    },
    mapSelectionToSource: (selection, target) => {
      const markTarget = getMarkSourceProjectionTarget(target);

      if (markTarget.hasFootnoteReferences && markTarget.sourceMap) {
        if (selection instanceof NodeSelection) {
          const documentOffset = selection.from - markTarget.from;
          const segment = markTarget.sourceMap.segments.find(
            (candidate) =>
              candidate.type === "footnoteReference" && candidate.documentFrom === documentOffset,
          );

          if (segment?.type === "footnoteReference") {
            return {
              anchor: markTarget.from + segment.labelFrom,
              head: markTarget.from + segment.labelTo,
            };
          }
        }

        const isForwardSelection = selection.anchor <= selection.head;
        const anchorAssociation = selection.empty || isForwardSelection ? 1 : -1;
        const headAssociation = selection.empty || !isForwardSelection ? 1 : -1;

        return {
          anchor: mapSelectionToMarkedFragmentSourcePosition(
            selection.anchor,
            markTarget,
            anchorAssociation,
          ),
          head: mapSelectionToMarkedFragmentSourcePosition(
            selection.head,
            markTarget,
            headAssociation,
          ),
        };
      }

      return {
        anchor: mapSelectionToSourcePosition(selection.anchor, markTarget),
        head: mapSelectionToSourcePosition(selection.head, markTarget),
      };
    },
    parseSource: (state, source, target) => {
      const markTarget = getMarkSourceProjectionTarget(target);

      if (markTarget.hasFootnoteReferences && parser && remark) {
        const richFragment = parseMarkedFragmentSource(state, source, parser, remark);

        if (richFragment) {
          return {
            replacement: richFragment.replacement,
            replacementSize: richFragment.map.documentSize,
            source,
          };
        }
      }

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

      if (target.hasFootnoteReferences) {
        return state.tr.replace(session.from, session.to, target.originalContent);
      }

      const sourceContentBounds = getProjectionSourceContentBounds(target.originalSource);
      const transaction = state.tr
        .delete(session.from + sourceContentBounds.to, session.to)
        .delete(session.from, session.from + sourceContentBounds.from);
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
    shouldHandleTextInput: shouldHandleMarkTextInput,
  };
};

export const MARK_SOURCE_PROJECTION_ADAPTER = createMarkSourceProjectionAdapter();

const SOURCE_PROJECTION_ADAPTERS: readonly SourceProjectionAdapter[] = [
  MARK_SOURCE_PROJECTION_ADAPTER,
];

export const findSourceProjectionTarget = (
  state: EditorState,
  adapters: readonly SourceProjectionAdapter[] = SOURCE_PROJECTION_ADAPTERS,
): SourceProjectionTargetMatch | null => {
  for (const adapter of adapters) {
    const target = adapter.findTarget(state);

    if (target) {
      return { adapter, target };
    }
  }

  return null;
};

export const findSourceProjectionInsertionCandidate = (
  state: EditorState,
  position: number,
  text: string,
  adapters: readonly SourceProjectionAdapter[] = SOURCE_PROJECTION_ADAPTERS,
): SourceProjectionInsertionMatch | null => {
  for (const adapter of adapters) {
    const candidate = adapter.findInsertionCandidate?.(state, position, text) ?? null;

    if (candidate) {
      return { adapter, candidate };
    }
  }

  return null;
};
