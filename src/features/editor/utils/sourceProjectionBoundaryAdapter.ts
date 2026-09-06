import type { EditorState, Selection } from "@milkdown/kit/prose/state";
import { EditorState as ProseMirrorEditorState, TextSelection } from "@milkdown/kit/prose/state";
import type { Parser, RemarkParser } from "@milkdown/kit/transformer";

import {
  createLiteralSourceProjectionSlice,
  decodeSourceProjectionEscapes,
  findLinkSourceCharacterReferences,
  findSourceProjectionEscapeOffsets,
  getCharacterReferenceSpans,
  getProjectionContentClassName,
  mapLiteralDocumentOffsetToSource,
  mapLiteralSourceOffsetToDocument,
  type LiteralSourceCommit,
  type SourceProjectionAdapter,
  type SourceProjectionParseResult,
  type SourceProjectionPresentation,
  type SourceProjectionPresentationPreview,
  type SourceProjectionPresentationSpan,
  type SourceProjectionSessionRange,
  type SourceProjectionTarget,
  type SourceProjectionTargetMatch,
} from "./sourceProjectionAdapters";
import { getDocumentDefinitionSources } from "./sourceProjectionDefinitions";
import {
  createInlineRunSourceStructure,
  mapInlineRunDocumentOffsetToSource,
  mapInlineRunSourceOffsetToDocument,
  parseInlineRunSource,
  type InlineRunSourceMap,
} from "./sourceProjectionInlineRunSyntax";
import { getRangeText, type TextRange } from "./textRanges";

const BOUNDARY_ADAPTER_ID = "boundary";
const ESCAPE_ADAPTER_ID = "escape";
const MARKER_CLASS_NAME = "leafdown-source-projection__marker";
const LINK_LABEL_CLASS_NAME = "leafdown-source-projection__content--link-label";
const FOOTNOTE_REFERENCE_CONTENT_CLASS_NAME =
  "leafdown-source-projection__content--footnote-reference";

export interface BoundarySourceProjectionTarget extends SourceProjectionTarget {
  adapterId: typeof BOUNDARY_ADAPTER_ID;
  definitions: readonly string[];
  // A run holding an escaped literal run keeps that adapter's rules: it authors nothing, and its
  // commit lands while the caret is still inside it.
  holdsEscape: boolean;
  seamDocumentOffset: number;
  seamSourceOffset: number;
}

type FindSideTarget = (state: EditorState) => SourceProjectionTargetMatch | null;

type FindLiteralSourceCommit = (state: EditorState, range: TextRange) => LiteralSourceCommit | null;

interface BoundaryAdapterDependencies {
  findLiteralSourceCommit: FindLiteralSourceCommit;
  findSideTarget: FindSideTarget;
  parser: Parser;
  remark: RemarkParser;
}

export const isBoundarySourceProjectionTarget = (
  target: SourceProjectionTarget,
): target is BoundarySourceProjectionTarget => target.adapterId === BOUNDARY_ADAPTER_ID;

// Discovery reads the canonical document rather than the live editor state, because the plugins the
// live state carries answer a selection change by projecting it, and a probe must leave the
// document as it found it.
const probeSideTarget = (
  state: EditorState,
  position: number,
  findSideTarget: FindSideTarget,
): SourceProjectionTargetMatch | null => {
  let probe: ProseMirrorEditorState;

  try {
    probe = ProseMirrorEditorState.create({
      doc: state.doc,
      plugins: [],
      selection: TextSelection.create(state.doc, position),
    });
  } catch {
    return null;
  }

  return findSideTarget(probe);
};

const findBoundaryTarget = (
  state: EditorState,
  findSideTarget: FindSideTarget,
): BoundarySourceProjectionTarget | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return null;
  }

  const position = selection.from;
  const $position = state.doc.resolve(position);

  // Two objects meet where the parent's children meet, so a caret inside a run of text is not on a
  // boundary and never pays for a probe.
  if ($position.textOffset !== 0 || !$position.nodeBefore || !$position.nodeAfter) {
    return null;
  }

  const left = probeSideTarget(state, position - 1, findSideTarget);

  if (!left || left.target.to !== position) {
    return null;
  }

  const right = probeSideTarget(state, position + 1, findSideTarget);

  if (!right || right.target.from !== position) {
    return null;
  }

  return {
    adapterId: BOUNDARY_ADAPTER_ID,
    definitions: getDocumentDefinitionSources(state.doc),
    from: left.target.from,
    holdsEscape: left.adapter.id === ESCAPE_ADAPTER_ID || right.adapter.id === ESCAPE_ADAPTER_ID,
    originalContent: state.doc.slice(left.target.from, right.target.to),
    originalContentSize: right.target.to - left.target.from,
    originalSource: left.target.originalSource + right.target.originalSource,
    seamDocumentOffset: left.target.to - left.target.from,
    seamSourceOffset: left.target.originalSource.length,
    to: right.target.to,
  };
};

const getRunPresentation = (
  source: string,
  map: InlineRunSourceMap,
): SourceProjectionPresentation => {
  const spans: SourceProjectionPresentationSpan[] = [];
  const previews: SourceProjectionPresentationPreview[] = [];
  const sourceTypes = new Set<string>();

  for (const segment of map.segments) {
    const contentClassName = getProjectionContentClassName(
      segment.marks.map((mark) => mark.markName),
    );

    for (const mark of segment.marks) {
      sourceTypes.add(mark.markName);
    }

    if (segment.type === "marker" || segment.type === "atom") {
      spans.push({ className: MARKER_CLASS_NAME, from: segment.sourceFrom, to: segment.sourceTo });
      continue;
    }

    if (segment.type === "text") {
      spans.push({ className: contentClassName, from: segment.sourceFrom, to: segment.sourceTo });
      continue;
    }

    if (segment.type === "characterReference") {
      sourceTypes.add("character-reference");
      previews.push({
        className: contentClassName,
        offset: segment.sourceFrom,
        text: segment.text,
      });
      spans.push({ className: MARKER_CLASS_NAME, from: segment.sourceFrom, to: segment.sourceTo });
      continue;
    }

    if (segment.type === "footnoteReference") {
      sourceTypes.add("footnote-reference");
      spans.push(
        { className: MARKER_CLASS_NAME, from: segment.sourceFrom, to: segment.labelFrom },
        {
          className: `${contentClassName} ${FOOTNOTE_REFERENCE_CONTENT_CLASS_NAME}`,
          from: segment.labelFrom,
          to: segment.labelTo,
        },
        { className: MARKER_CLASS_NAME, from: segment.labelTo, to: segment.sourceTo },
      );
      continue;
    }

    const labelFrom = segment.sourceFrom + segment.map.labelFrom;
    const labelTo = segment.sourceFrom + segment.map.labelTo;
    const labelClassName = `${contentClassName} ${LINK_LABEL_CLASS_NAME}`;
    const references = findLinkSourceCharacterReferences(
      source.slice(segment.sourceFrom, segment.sourceTo),
      segment.map,
      segment.sourceFrom,
    );

    sourceTypes.add("link");
    previews.push(
      ...references.map(({ from, text }) => ({ className: labelClassName, offset: from, text })),
    );
    spans.push(
      { className: MARKER_CLASS_NAME, from: segment.sourceFrom, to: labelFrom },
      ...getCharacterReferenceSpans(labelClassName, { from: labelFrom, to: labelTo }, references),
      { className: MARKER_CLASS_NAME, from: labelTo, to: segment.sourceTo },
    );
  }

  return {
    previews,
    sourceTypes: [...sourceTypes],
    spans: spans.filter(({ from, to }) => from < to),
  };
};

const isSemanticRunSelection = (
  selection: Selection,
  session: SourceProjectionSessionRange<BoundarySourceProjectionTarget>,
  map: InlineRunSourceMap,
) => {
  const from = selection.from - session.from;
  const to = selection.to - session.from;

  // A partial delimiter, atom, or reference has no semantic form of its own, so a selection that
  // takes part of one stays the literal characters it covers.
  return map.segments.every((segment) => {
    if (segment.type === "text" || segment.type === "link") {
      return true;
    }

    const overlaps = from < segment.sourceTo && segment.sourceFrom < to;

    return !overlaps || (from <= segment.sourceFrom && segment.sourceTo <= to);
  });
};

export const createBoundarySourceProjectionAdapter = ({
  findLiteralSourceCommit,
  findSideTarget,
  parser,
  remark,
}: BoundaryAdapterDependencies): SourceProjectionAdapter<BoundarySourceProjectionTarget> => {
  const readSourceMap = (source: string, definitions: readonly string[]) =>
    createInlineRunSourceStructure(source, parser, remark, definitions);

  const mapPositionFromSource = (
    position: number,
    session: SourceProjectionSessionRange<BoundarySourceProjectionTarget>,
    result: SourceProjectionParseResult,
  ) => {
    if (position <= session.from) {
      return position;
    }

    if (position >= session.to) {
      return session.from + result.replacementSize + (position - session.to);
    }

    const map = readSourceMap(result.source, session.target.definitions);
    const offset = position - session.from;
    const documentOffset = map
      ? mapInlineRunSourceOffsetToDocument(offset, map)
      : mapLiteralSourceOffsetToDocument(result.source, offset);

    return session.from + Math.min(documentOffset, result.replacementSize);
  };

  const mapPositionToSource = (
    position: number,
    target: BoundarySourceProjectionTarget,
    association: -1 | 1,
  ) => {
    if (position <= target.from) {
      return position;
    }

    if (position >= target.to) {
      return target.from + target.originalSource.length + (position - target.to);
    }

    const offset = position - target.from;

    // Where the two objects meet, one document position stands for several source offsets: the one
    // before the first object's closing delimiter, the one after the second object's opening
    // delimiter, and the one between them. The caret takes the position between them, which belongs
    // to neither object, so a character written there is text the file holds between the two.
    if (offset === target.seamDocumentOffset) {
      return target.from + target.seamSourceOffset;
    }

    const map = readSourceMap(target.originalSource, target.definitions);

    return (
      target.from +
      (map
        ? mapInlineRunDocumentOffsetToSource(offset, map, association)
        : mapLiteralDocumentOffsetToSource(target.originalSource, offset))
    );
  };

  return {
    id: BOUNDARY_ADAPTER_ID,
    canCopySelectionSemantically: (selection, session, parsed) => {
      const map = readSourceMap(parsed.source, session.target.definitions);

      return map ? isSemanticRunSelection(selection, session, map) : false;
    },
    createEnterTransaction: (state, target) =>
      state.tr.replace(
        target.from,
        target.to,
        createLiteralSourceProjectionSlice(state, target.originalSource),
      ),
    findTarget: (state) => findBoundaryTarget(state, findSideTarget),
    getPresentation: (target, source) => {
      const map = readSourceMap(source, target.definitions);

      return map ? getRunPresentation(source, map) : { previews: [], sourceTypes: [], spans: [] };
    },
    mapSelectionFromSource: (selection, session, result) => ({
      anchor: mapPositionFromSource(selection.anchor, session, result),
      head: mapPositionFromSource(selection.head, session, result),
    }),
    mapSelectionToSource: (selection, target) => {
      const isForward = selection.anchor <= selection.head;

      return {
        anchor: mapPositionToSource(
          selection.anchor,
          target,
          selection.empty || isForward ? 1 : -1,
        ),
        head: mapPositionToSource(selection.head, target, selection.empty || !isForward ? 1 : -1),
      };
    },
    // The run commits as the content the file would read it as, which is what keeps an object the
    // author did not touch whole and leaves a character written between two of them as text.
    parseSource: (state, source, target) => {
      const parsed = parseInlineRunSource(state, source, parser, remark, target.definitions);

      if (parsed) {
        return { replacement: parsed.replacement, replacementSize: parsed.replacementSize, source };
      }

      const literal = decodeSourceProjectionEscapes(source);

      return {
        replacement: createLiteralSourceProjectionSlice(state, literal),
        replacementSize: literal.length,
        source,
      };
    },
    restoreCleanTarget: (state, session) =>
      state.tr.replace(session.from, session.to, session.target.originalContent),
    // An escape converts as soon as the run it covers spells the object it was hiding, rather than
    // when the caret leaves. Only the side that carried the escape can reach that state, so the
    // commit is offered where that side meets the edge of the run.
    shouldFinalizeInPlace: (state, session) => {
      if (!session.target.holdsEscape) {
        return false;
      }

      return [session.from, session.to].some((position) => {
        const commit = findLiteralSourceCommit(state, { from: position, to: position });

        if (!commit || commit.from < session.from || session.to < commit.to) {
          return false;
        }

        return (
          (commit.from === session.from || commit.to === session.to) &&
          findSourceProjectionEscapeOffsets(getRangeText(state.doc, commit)).length === 0
        );
      });
    },
  };
};
