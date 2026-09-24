import { Slice } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { MarkdownNode, Parser, RemarkParser } from "@milkdown/kit/transformer";
import type { ConstructName } from "mdast-util-to-markdown";

import {
  CHARACTER_REFERENCE_MARKDOWN_TYPE,
  decodeWholeCharacterReference,
} from "./characterReferenceMarkdown";
import {
  isInsideTableCell,
  readCellCodeSpanBoundaries,
  readCellCodeSpanValue,
} from "./codeMarkdown";
import { findHardBreakRun, HARD_BREAK_MARKDOWN_TYPE, readSoftBreak } from "./hardBreakMarkdown";
import { getAugmentedParagraph, withProjectionDefinitions } from "./sourceProjectionDefinitions";
import {
  getFootnoteReferenceSourceBounds,
  mapFootnoteReferenceSourceOffsetToDocument,
  parseFootnoteReferenceSource,
} from "./sourceProjectionFootnoteReferenceSyntax";
import {
  createLinkSourceMap,
  mapLinkDocumentPositionToSource,
  mapLinkSourcePositionToDocument,
  type LinkSourceMap,
} from "./sourceProjectionLinkSyntax";
import {
  findSourceProjectionDocumentSegment,
  findSourceProjectionSegment,
  mapNearestSourceProjectionBoundaryToDocument,
  mapSourceProjectionDocumentOffsetToSource,
  mapSourceProjectionDocumentEdgeToSource,
  mapSourceProjectionSourceEdgeToDocument,
} from "./sourceProjectionMap";
import { getMarkdownSourcePosition } from "./sourceProjectionMarkdown";
import {
  createProjectionMarkDescriptor,
  getProjectionSourceContentBounds,
  type ProjectionMarkDescriptor,
  type ProjectionMarkName,
} from "./sourceProjectionSyntax";
import type { TextRange } from "./textRanges";

interface InlineRunSourceSegmentBase {
  documentFrom: number;
  documentTo: number;
  marks: ProjectionMarkDescriptor[];
  sourceFrom: number;
  sourceTo: number;
}

// Source the run spends on syntax rather than on content, which is every delimiter a mark or an
// object writes. It holds no document offset of its own, so it is the one segment whose document
// bounds are equal.
interface InlineRunMarkerSourceSegment extends InlineRunSourceSegmentBase {
  type: "marker";
}

interface InlineRunTextSourceSegment extends InlineRunSourceSegmentBase {
  // One source offset per document offset the run covers, so a backslash the file spends on an
  // escape maps onto the character it keeps literal rather than onto a position of its own.
  sourceBoundaries: number[];
  text: string;
  type: "text";
}

interface InlineRunLinkSourceSegment extends InlineRunSourceSegmentBase {
  // Offsets are relative to the link's own source, which starts at `sourceFrom`.
  map: LinkSourceMap;
  type: "link";
}

// A soft line ending writes no run, so `runTo` is null.
interface InlineRunBreakSourceSegment extends InlineRunSourceSegmentBase, BreakSourceBounds {
  type: "break";
}

interface InlineRunCharacterReferenceSourceSegment extends InlineRunSourceSegmentBase {
  text: string;
  type: "characterReference";
}

interface InlineRunFootnoteReferenceSourceSegment extends InlineRunSourceSegmentBase {
  labelFrom: number;
  labelTo: number;
  type: "footnoteReference";
}

// An object the document holds as one indivisible node, whose whole source reads as syntax.
interface InlineRunAtomSourceSegment extends InlineRunSourceSegmentBase {
  type: "atom";
}

export type InlineRunSourceSegment =
  | InlineRunAtomSourceSegment
  | InlineRunBreakSourceSegment
  | InlineRunCharacterReferenceSourceSegment
  | InlineRunFootnoteReferenceSourceSegment
  | InlineRunLinkSourceSegment
  | InlineRunMarkerSourceSegment
  | InlineRunTextSourceSegment;

export interface InlineRunSourceMap {
  documentSize: number;
  segments: InlineRunSourceSegment[];
}

export interface ParsedInlineRunSource {
  map: InlineRunSourceMap;
  replacement: Slice;
  replacementSize: number;
}

interface InlineRunWalkContext {
  constructs: readonly ConstructName[];
  definitions: readonly string[];
  parser: Parser;
  remark: RemarkParser;
  segments: InlineRunSourceSegment[];
  source: string;
}

const MARK_MARKDOWN_TYPES = new Map<string, ProjectionMarkName>([
  ["delete", "strike_through"],
  ["emphasis", "emphasis"],
  ["strong", "strong"],
]);

const LINK_MARKDOWN_TYPES = new Set(["link", "linkReference"]);
const IMAGE_MARKDOWN_TYPES = new Set(["image", "imageReference"]);

// Walks the source against the text a run holds, returning the source offset each document offset
// falls on. A preserved reference is a segment of its own, so the only character a run spends
// source on and does not hold is an escape. Null where the two stop lining up, which leaves every
// caller on its unescaped fallback rather than on a guess about where the file spends characters.
export const readTextSourceBoundaries = (source: string, from: number, value: string) => {
  const boundaries = [from];
  let sourceOffset = from;
  let valueOffset = 0;

  while (valueOffset < value.length) {
    if (source[sourceOffset] === "\\" && source[sourceOffset + 1] === value[valueOffset]) {
      sourceOffset += 2;
    } else if (source[sourceOffset] === value[valueOffset]) {
      sourceOffset += 1;
    } else {
      return null;
    }

    valueOffset += 1;
    boundaries.push(sourceOffset);
  }

  return boundaries;
};

export const createIdentityBoundaries = (sourceFrom: number, length: number) =>
  Array.from({ length: length + 1 }, (_, offset) => sourceFrom + offset);

export interface BreakSourceBounds {
  runTo: number | null;
  sourceTo: number;
}

// The whitespace a soft line ending spends closing its line, which the text before it does not hold.
const SOFT_BREAK_SOURCE_PATTERN = /^[\t ]*(?:\r\n?|\n)/u;
const LINE_INDENTATION_PATTERN = /^[\t ]*/u;

// Splitting a soft line ending out of the text it was read in leaves neither the break nor the text
// beside it a position, so each is read off the source from where the child before it ended.
export const findUnpositionedChildRange = (
  source: string,
  from: number,
  child: MarkdownNode,
): TextRange | null => {
  if (child.type === HARD_BREAK_MARKDOWN_TYPE) {
    const lineEnding = SOFT_BREAK_SOURCE_PATTERN.exec(source.slice(from))?.[0];

    return lineEnding === undefined ? null : { from, to: from + lineEnding.length };
  }

  if (child.type !== "text" || typeof child.value !== "string") {
    return null;
  }

  const boundaries = readTextSourceBoundaries(source, from, child.value);

  return boundaries ? { from, to: boundaries[boundaries.length - 1] } : null;
};

// A break stands for one document position however many characters the file spends on it: the run
// a hard break is written with, the line ending, and the indentation the next line opens on, which
// the text after it does not hold.
export const readBreakSourceBounds = (
  source: string,
  { from, to }: TextRange,
  child: MarkdownNode,
  limit: number,
): BreakSourceBounds => ({
  runTo: readSoftBreak(child) ? null : from + findHardBreakRun(source.slice(from, to)).length,
  sourceTo: Math.min(
    to + (LINE_INDENTATION_PATTERN.exec(source.slice(to))?.[0].length ?? 0),
    limit,
  ),
});

const addRunTextSegment = (
  { segments, source }: InlineRunWalkContext,
  sourceFrom: number,
  sourceTo: number,
  marks: ProjectionMarkDescriptor[],
  documentOffset: number,
) => {
  if (sourceFrom >= sourceTo) {
    return documentOffset;
  }

  const text = source.slice(sourceFrom, sourceTo);

  segments.push({
    documentFrom: documentOffset,
    documentTo: documentOffset + text.length,
    marks,
    sourceBoundaries: createIdentityBoundaries(sourceFrom, text.length),
    sourceFrom,
    sourceTo,
    text,
    type: "text",
  });

  return documentOffset + text.length;
};

const addRunMarkerSegment = (
  { segments }: InlineRunWalkContext,
  sourceFrom: number,
  sourceTo: number,
  marks: ProjectionMarkDescriptor[],
  documentOffset: number,
) => {
  if (sourceFrom < sourceTo) {
    segments.push({
      documentFrom: documentOffset,
      documentTo: documentOffset,
      marks,
      sourceFrom,
      sourceTo,
      type: "marker",
    });
  }

  return documentOffset;
};

const addRunMarkSegments = (
  context: InlineRunWalkContext,
  node: MarkdownNode,
  position: TextRange,
  markName: ProjectionMarkName,
  marks: ProjectionMarkDescriptor[],
  documentOffset: number,
): number | null => {
  const children = node.children ?? [];

  if (!children.length) {
    return null;
  }

  // A child split out beside a soft line ending has no position, so the content is bounded by the
  // delimiters the mark itself spells instead.
  const delimiterLength =
    markName === "emphasis"
      ? 1
      : markName === "strong"
        ? 2
        : (/^~+/u.exec(context.source.slice(position.from))?.[0].length ?? 0);
  const contentFrom =
    getMarkdownSourcePosition(children[0])?.from ?? position.from + delimiterLength;
  const contentTo =
    getMarkdownSourcePosition(children[children.length - 1])?.to ?? position.to - delimiterLength;

  const descriptor = createProjectionMarkDescriptor(markName, {
    marker: context.source[position.from],
  });
  const nested = [...marks, descriptor];

  addRunMarkerSegment(context, position.from, contentFrom, nested, documentOffset);

  const contentOffset = collectRunSegments(
    context,
    children,
    { from: contentFrom, to: contentTo },
    nested,
    documentOffset,
  );

  if (contentOffset === null) {
    return null;
  }

  return addRunMarkerSegment(context, contentTo, position.to, nested, contentOffset);
};

const addRunInlineCodeSegments = (
  context: InlineRunWalkContext,
  node: MarkdownNode,
  position: TextRange,
  marks: ProjectionMarkDescriptor[],
  documentOffset: number,
): number | null => {
  const content = typeof node.value === "string" ? node.value : null;
  const source = context.source.slice(position.from, position.to);
  const bounds = getProjectionSourceContentBounds(source);

  if (content === null || source.slice(bounds.from, bounds.to) !== content) {
    return null;
  }

  const isCellCodeSpan = isInsideTableCell(context.constructs);
  const value = isCellCodeSpan ? readCellCodeSpanValue(content) : content;
  const nested = [...marks, createProjectionMarkDescriptor("inlineCode")];
  const contentFrom = position.from + bounds.from;
  const contentTo = position.from + bounds.to;

  addRunMarkerSegment(context, position.from, contentFrom, nested, documentOffset);

  if (contentFrom < contentTo) {
    context.segments.push({
      documentFrom: documentOffset,
      documentTo: documentOffset + value.length,
      marks: nested,
      // A code span keeps every character it holds, so only the pipes a cell escapes spend source.
      sourceBoundaries: isCellCodeSpan
        ? readCellCodeSpanBoundaries(content, contentFrom)
        : createIdentityBoundaries(contentFrom, value.length),
      sourceFrom: contentFrom,
      sourceTo: contentTo,
      text: value,
      type: "text",
    });
  }

  return addRunMarkerSegment(
    context,
    contentTo,
    position.to,
    nested,
    documentOffset + value.length,
  );
};

const addRunChildSegment = (
  context: InlineRunWalkContext,
  node: MarkdownNode,
  position: TextRange,
  marks: ProjectionMarkDescriptor[],
  documentOffset: number,
): number | null => {
  const { constructs, definitions, parser, remark, segments, source } = context;
  const nodeSource = source.slice(position.from, position.to);
  const markName = MARK_MARKDOWN_TYPES.get(node.type);

  if (markName) {
    return addRunMarkSegments(context, node, position, markName, marks, documentOffset);
  }

  if (node.type === "inlineCode") {
    return addRunInlineCodeSegments(context, node, position, marks, documentOffset);
  }

  if (node.type === "text") {
    const value = typeof node.value === "string" ? node.value : "";
    const boundaries = readTextSourceBoundaries(source, position.from, value);

    if (!boundaries || boundaries[boundaries.length - 1] !== position.to) {
      return null;
    }

    segments.push({
      documentFrom: documentOffset,
      documentTo: documentOffset + value.length,
      marks,
      sourceBoundaries: boundaries,
      sourceFrom: position.from,
      sourceTo: position.to,
      text: value,
      type: "text",
    });

    return documentOffset + value.length;
  }

  if (LINK_MARKDOWN_TYPES.has(node.type)) {
    const map = createLinkSourceMap(remark, nodeSource, definitions, constructs);

    if (!map) {
      return null;
    }

    segments.push({
      documentFrom: documentOffset,
      documentTo: documentOffset + map.documentSize,
      map,
      marks,
      sourceFrom: position.from,
      sourceTo: position.to,
      type: "link",
    });

    return documentOffset + map.documentSize;
  }

  if (IMAGE_MARKDOWN_TYPES.has(node.type)) {
    segments.push({
      documentFrom: documentOffset,
      documentTo: documentOffset + 1,
      marks,
      sourceFrom: position.from,
      sourceTo: position.to,
      type: "atom",
    });

    return documentOffset + 1;
  }

  if (node.type === CHARACTER_REFERENCE_MARKDOWN_TYPE) {
    const text = decodeWholeCharacterReference(nodeSource);

    if (text === null) {
      return null;
    }

    segments.push({
      documentFrom: documentOffset,
      documentTo: documentOffset + text.length,
      marks,
      sourceFrom: position.from,
      sourceTo: position.to,
      text,
      type: "characterReference",
    });

    return documentOffset + text.length;
  }

  if (node.type === "footnoteReference") {
    const reference = parseFootnoteReferenceSource(parser, nodeSource);
    const bounds = getFootnoteReferenceSourceBounds(nodeSource);

    if (!reference || !bounds) {
      return null;
    }

    segments.push({
      documentFrom: documentOffset,
      documentTo: documentOffset + reference.nodeSize,
      labelFrom: position.from + bounds.labelFrom,
      labelTo: position.from + bounds.labelTo,
      marks,
      sourceFrom: position.from,
      sourceTo: position.to,
      type: "footnoteReference",
    });

    return documentOffset + reference.nodeSize;
  }

  return null;
};

const collectRunSegments = (
  context: InlineRunWalkContext,
  children: readonly MarkdownNode[],
  bounds: TextRange,
  marks: ProjectionMarkDescriptor[],
  documentOffset: number,
): number | null => {
  let sourceOffset = bounds.from;
  let offset = documentOffset;

  for (const child of children) {
    const position =
      getMarkdownSourcePosition(child) ??
      findUnpositionedChildRange(context.source, sourceOffset, child);

    if (!position || position.from < sourceOffset || position.to > bounds.to) {
      return null;
    }

    offset = addRunTextSegment(context, sourceOffset, position.from, marks, offset);

    if (child.type === HARD_BREAK_MARKDOWN_TYPE) {
      const breakBounds = readBreakSourceBounds(context.source, position, child, bounds.to);

      context.segments.push({
        ...breakBounds,
        documentFrom: offset,
        documentTo: offset + 1,
        marks,
        sourceFrom: position.from,
        type: "break",
      });
      offset += 1;
      sourceOffset = breakBounds.sourceTo;
      continue;
    }

    const next = addRunChildSegment(context, child, position, marks, offset);

    if (next === null) {
      return null;
    }

    offset = next;
    sourceOffset = position.to;
  }

  return addRunTextSegment(context, sourceOffset, bounds.to, marks, offset);
};

export const createInlineRunSourceStructure = (
  source: string,
  parser: Parser,
  remark: RemarkParser,
  definitions: readonly string[] = [],
  constructs: readonly ConstructName[] = [],
): InlineRunSourceMap | null => {
  const context: InlineRunWalkContext = {
    constructs,
    definitions,
    parser,
    remark,
    segments: [],
    source,
  };
  const augmented = withProjectionDefinitions(source, definitions);
  let root: MarkdownNode;

  try {
    root = remark.parse(augmented) as MarkdownNode;
    root = remark.runSync(root, augmented) as MarkdownNode;
  } catch {
    return null;
  }

  const paragraph = root.type === "root" ? root.children?.[0] : undefined;
  const blocksAfter = root.children?.slice(1) ?? [];

  // A run is one paragraph's worth of inline content. Anything the source opens beyond it, other
  // than the definitions appended to resolve its references, is structure a projection cannot hold.
  if (
    paragraph?.type !== "paragraph" ||
    !paragraph.children?.length ||
    blocksAfter.some(
      (node) => (getMarkdownSourcePosition(node)?.from ?? source.length) < source.length,
    )
  ) {
    return null;
  }

  const documentSize = collectRunSegments(
    context,
    paragraph.children,
    { from: 0, to: source.length },
    [],
    0,
  );

  return documentSize === null ? null : { documentSize, segments: context.segments };
};

export const parseInlineRunSource = (
  state: EditorState,
  source: string,
  parser: Parser,
  remark: RemarkParser,
  definitions: readonly string[] = [],
  constructs: readonly ConstructName[] = [],
): ParsedInlineRunSource | null => {
  const map = createInlineRunSourceStructure(source, parser, remark, definitions, constructs);

  if (!map) {
    return null;
  }

  let document;

  try {
    document = parser(withProjectionDefinitions(source, definitions));
  } catch {
    return null;
  }

  const paragraph = getAugmentedParagraph(document, constructs);

  // The run commits as the content the file would read it as, so the map is only trusted where it
  // agrees with that content about how much document the source spells.
  if (
    paragraph?.type !== state.schema.nodes.paragraph ||
    paragraph.content.size !== map.documentSize
  ) {
    return null;
  }

  return {
    map,
    replacement: new Slice(paragraph.content, 0, 0),
    replacementSize: paragraph.content.size,
  };
};

export const mapInlineRunSourceOffsetToDocument = (offset: number, map: InlineRunSourceMap) => {
  if (offset <= 0) {
    return 0;
  }

  const segment = findSourceProjectionSegment(map.segments, offset);

  if (!segment) {
    return map.documentSize;
  }

  if (segment.type === "marker") {
    return segment.documentFrom;
  }

  if (segment.type === "link") {
    return (
      segment.documentFrom +
      mapLinkSourcePositionToDocument(offset - segment.sourceFrom, segment.map)
    );
  }

  if (segment.type === "footnoteReference") {
    return (
      segment.documentFrom +
      mapFootnoteReferenceSourceOffsetToDocument(offset, {
        labelFrom: segment.labelFrom,
        labelTo: segment.labelTo,
      })
    );
  }

  if (
    segment.type === "atom" ||
    segment.type === "break" ||
    segment.type === "characterReference"
  ) {
    return mapSourceProjectionSourceEdgeToDocument(offset, segment);
  }

  return mapNearestSourceProjectionBoundaryToDocument(offset, segment);
};

export const mapInlineRunDocumentOffsetToSource = (
  offset: number,
  map: InlineRunSourceMap,
  association: -1 | 1 = 1,
) => {
  const normalizedOffset = Math.min(Math.max(offset, 0), map.documentSize);
  const segment = findSourceProjectionDocumentSegment(
    map.segments,
    normalizedOffset,
    association,
    (candidate) => candidate.type !== "marker",
  );

  if (!segment) {
    return 0;
  }

  if (segment.type === "marker") {
    return segment.sourceTo;
  }

  if (segment.type === "link") {
    return (
      segment.sourceFrom +
      mapLinkDocumentPositionToSource(
        normalizedOffset - segment.documentFrom,
        segment.map,
        association,
      )
    );
  }

  if (
    segment.type === "atom" ||
    segment.type === "break" ||
    segment.type === "characterReference" ||
    segment.type === "footnoteReference"
  ) {
    return mapSourceProjectionDocumentEdgeToSource(normalizedOffset, segment);
  }

  return mapSourceProjectionDocumentOffsetToSource(normalizedOffset, segment);
};
