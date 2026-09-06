import { Slice } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { MarkdownNode, Parser, RemarkParser } from "@milkdown/kit/transformer";

import {
  CHARACTER_REFERENCE_MARKDOWN_TYPE,
  decodeWholeCharacterReference,
} from "./characterReferenceMarkdown";
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

export const getMarkdownSourcePosition = (node: MarkdownNode) => {
  const position = node.position as
    | { end?: { offset?: number }; start?: { offset?: number } }
    | undefined;
  const from = position?.start?.offset;
  const to = position?.end?.offset;

  return typeof from === "number" && typeof to === "number" ? { from, to } : null;
};

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
  const contentFrom = children.length ? getMarkdownSourcePosition(children[0])?.from : undefined;
  const contentTo = children.length
    ? getMarkdownSourcePosition(children[children.length - 1])?.to
    : undefined;

  if (contentFrom === undefined || contentTo === undefined) {
    return null;
  }

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
  const value = typeof node.value === "string" ? node.value : null;
  const source = context.source.slice(position.from, position.to);
  const bounds = getProjectionSourceContentBounds(source);

  if (value === null || source.slice(bounds.from, bounds.to) !== value) {
    return null;
  }

  const nested = [...marks, createProjectionMarkDescriptor("inlineCode")];
  const contentFrom = position.from + bounds.from;
  const contentTo = position.from + bounds.to;

  addRunMarkerSegment(context, position.from, contentFrom, nested, documentOffset);

  if (contentFrom < contentTo) {
    context.segments.push({
      documentFrom: documentOffset,
      documentTo: documentOffset + value.length,
      marks: nested,
      // A code span keeps every character it holds, so no source offset is spent on an escape.
      sourceBoundaries: createIdentityBoundaries(contentFrom, value.length),
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
  const { definitions, parser, remark, segments, source } = context;
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
    const map = createLinkSourceMap(remark, nodeSource, definitions);

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
    const position = getMarkdownSourcePosition(child);

    if (!position || position.from < sourceOffset || position.to > bounds.to) {
      return null;
    }

    offset = addRunTextSegment(context, sourceOffset, position.from, marks, offset);

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
): InlineRunSourceMap | null => {
  const context: InlineRunWalkContext = { definitions, parser, remark, segments: [], source };
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
): ParsedInlineRunSource | null => {
  const map = createInlineRunSourceStructure(source, parser, remark, definitions);

  if (!map) {
    return null;
  }

  let document;

  try {
    document = parser(withProjectionDefinitions(source, definitions));
  } catch {
    return null;
  }

  const paragraph = getAugmentedParagraph(document);

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

  const segment = map.segments.find(
    ({ sourceFrom, sourceTo }) => sourceFrom <= offset && offset <= sourceTo,
  );

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

  if (segment.type === "atom" || segment.type === "characterReference") {
    return offset - segment.sourceFrom < segment.sourceTo - offset
      ? segment.documentFrom
      : segment.documentTo;
  }

  let closestOffset = segment.documentFrom;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const [documentOffset, sourcePosition] of segment.sourceBoundaries.entries()) {
    const distance = Math.abs(offset - sourcePosition);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestOffset = segment.documentFrom + documentOffset;
    }
  }

  return closestOffset;
};

export const mapInlineRunDocumentOffsetToSource = (
  offset: number,
  map: InlineRunSourceMap,
  association: -1 | 1 = 1,
) => {
  const normalizedOffset = Math.min(Math.max(offset, 0), map.documentSize);
  const matchingSegments = map.segments.filter(
    (segment) =>
      segment.type !== "marker" &&
      segment.documentFrom <= normalizedOffset &&
      normalizedOffset <= segment.documentTo,
  );
  const segment =
    (association < 0 ? matchingSegments[0] : matchingSegments.at(-1)) ?? map.segments.at(-1);

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
    segment.type === "characterReference" ||
    segment.type === "footnoteReference"
  ) {
    return normalizedOffset <= segment.documentFrom ? segment.sourceFrom : segment.sourceTo;
  }

  return segment.sourceBoundaries[
    Math.min(
      Math.max(normalizedOffset - segment.documentFrom, 0),
      segment.sourceBoundaries.length - 1,
    )
  ];
};
