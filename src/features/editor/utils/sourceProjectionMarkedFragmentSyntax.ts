import {
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
} from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { MarkdownNode, Parser, RemarkParser, Serializer } from "@milkdown/kit/transformer";

import {
  CHARACTER_REFERENCE_MARK_NAME,
  CHARACTER_REFERENCE_MARKDOWN_TYPE,
  CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME,
  decodeWholeCharacterReference,
  getPreservedCharacterReferenceSource,
} from "./characterReferenceMarkdown";
import { serializeLinkRunSource } from "./logicalLinkMarkdown";
import {
  getFootnoteAugmentedParagraph,
  getFootnoteReferenceSourceBounds,
  mapFootnoteReferenceSourceOffsetToDocument,
  parseFootnoteReferenceSource,
  serializeFootnoteReference,
  withFootnoteDefinitions,
} from "./sourceProjectionFootnoteReferenceSyntax";
import {
  createLinkSourceMap,
  isSupportedLinkChild,
  mapLinkDocumentPositionToSource,
  mapLinkSourcePositionToDocument,
  type LinkSourceMap,
} from "./sourceProjectionLinkSyntax";
import {
  createProjectionSource,
  getProjectionSourceContentBounds,
  parseProjectionSource,
  type ProjectionMarkDescriptor,
} from "./sourceProjectionSyntax";

const INLINE_BREAK_NODE_NAME = "hardbreak";
const LINK_MARK_NAME = "link";

interface MarkedFragmentSourceSegmentBase {
  documentFrom: number;
  documentTo: number;
  sourceFrom: number;
  sourceTo: number;
}

interface MarkedFragmentCharacterReferenceSourceSegment extends MarkedFragmentSourceSegmentBase {
  type: "characterReference";
}

interface MarkedFragmentReferenceSourceSegment extends MarkedFragmentSourceSegmentBase {
  labelFrom: number;
  labelTo: number;
  type: "footnoteReference";
}

interface MarkedFragmentLinkSourceSegment extends MarkedFragmentSourceSegmentBase {
  // Offsets are relative to the link's own source, which starts at `sourceFrom`.
  map: LinkSourceMap | null;
  type: "link";
}

interface MarkedFragmentTextSourceSegment extends MarkedFragmentSourceSegmentBase {
  // One source offset per document offset the run covers, so a backslash the file spends on an
  // escape maps onto the character it keeps literal rather than onto a position of its own.
  sourceBoundaries: number[];
  text: string;
  type: "text";
}

export type MarkedFragmentSourceSegment =
  | MarkedFragmentCharacterReferenceSourceSegment
  | MarkedFragmentLinkSourceSegment
  | MarkedFragmentReferenceSourceSegment
  | MarkedFragmentTextSourceSegment;

export interface MarkedFragmentSourceMap {
  contentFrom: number;
  contentTo: number;
  documentSize: number;
  segments: MarkedFragmentSourceSegment[];
}

export interface ParsedMarkedFragmentSource {
  map: MarkedFragmentSourceMap;
  marks: ProjectionMarkDescriptor[];
  replacement: Slice;
}

export interface MarkedFragmentSourceStructure {
  map: MarkedFragmentSourceMap;
  marks: ProjectionMarkDescriptor[];
}

interface SerializedMarkedFragmentSource {
  // Whether the source spends characters the document does not hold, which is what decides
  // between projecting the source as literal text and wrapping the document's own text in
  // markers. An inline object, a preserved reference, and an escape all spend them.
  hasSourceOnlyContent: boolean;
  map: MarkedFragmentSourceMap;
  source: string;
}

interface MarkdownPosition {
  end?: { offset?: number };
  start?: { offset?: number };
}

type MarkdownValidationResult =
  | { children: MarkdownNode[]; type: "structured" }
  | { type: "invalidOuter" }
  | { type: "unsupportedInner" };

const MARKDOWN_MARK_TYPES = new Map<string, string>([
  ["emphasis", "emphasis"],
  ["strike_through", "delete"],
  ["strong", "strong"],
]);

const getMarkdownPosition = (node: MarkdownNode) => {
  const position = node.position as MarkdownPosition | undefined;
  const from = position?.start?.offset;
  const to = position?.end?.offset;

  return typeof from === "number" && typeof to === "number" ? { from, to } : null;
};

const getLinkMark = (node: ProseMirrorNode) =>
  node.marks.find((mark) => mark.type.name === LINK_MARK_NAME) ?? null;

const getLinkRunEnd = (nodes: readonly ProseMirrorNode[], from: number, linkMark: Mark) => {
  let runEnd = from + 1;

  while (runEnd < nodes.length && getLinkMark(nodes[runEnd])?.eq(linkMark)) {
    runEnd += 1;
  }

  return runEnd;
};

const createDocumentMarks = (state: EditorState, marks: readonly ProjectionMarkDescriptor[]) =>
  marks.map((mark) => state.schema.marks[mark.markName].create(mark.attrs));

const createTextNode = (state: EditorState, text: string, marks: readonly Mark[]) =>
  text ? state.schema.text(text, marks) : null;

const parseLinkSourceNodes = (
  state: EditorState,
  parser: Parser,
  source: string,
  marks: readonly Mark[],
  documentSize: number,
) => {
  let document: ProseMirrorNode;

  try {
    document = parser(withFootnoteDefinitions(source));
  } catch {
    return null;
  }

  const paragraph = getFootnoteAugmentedParagraph(document);

  if (paragraph?.type !== state.schema.nodes.paragraph || paragraph.content.size !== documentSize) {
    return null;
  }

  const nodes: ProseMirrorNode[] = [];

  paragraph.forEach((node) =>
    nodes.push(node.mark(marks.reduce((markSet, mark) => mark.addToSet(markSet), node.marks))),
  );

  return nodes;
};

// Walks the source against the text a run holds, returning the source offset each document offset
// falls on. A preserved reference is a segment of its own, so the only character a run spends
// source on and does not hold is an escape. Null where the two stop lining up, which leaves every
// caller on its unescaped fallback rather than on a guess about where the file spends characters.
const readTextSourceBoundaries = (source: string, from: number, value: string) => {
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

const createTextSegment = (
  documentFrom: number,
  sourceFrom: number,
  sourceTo: number,
  text: string,
  sourceBoundaries: number[],
): MarkedFragmentTextSourceSegment => ({
  documentFrom,
  documentTo: documentFrom + text.length,
  sourceBoundaries,
  sourceFrom,
  sourceTo,
  text,
  type: "text",
});

const createIdentityBoundaries = (sourceFrom: number, length: number) =>
  Array.from({ length: length + 1 }, (_, offset) => sourceFrom + offset);

const addTextMapSegment = (
  sourceFrom: number,
  sourceTo: number,
  segments: MarkedFragmentSourceSegment[],
  documentOffset: number,
  source: string,
) => {
  if (sourceFrom >= sourceTo) {
    return documentOffset;
  }

  const text = source.slice(sourceFrom, sourceTo);

  segments.push(
    createTextSegment(
      documentOffset,
      sourceFrom,
      sourceTo,
      text,
      createIdentityBoundaries(sourceFrom, text.length),
    ),
  );

  return documentOffset + text.length;
};

const createMarkedLiteralStructure = (
  source: string,
  marks: ProjectionMarkDescriptor[],
): MarkedFragmentSourceStructure => {
  const { from, to } = getProjectionSourceContentBounds(source);
  const documentSize = to - from;

  return {
    map: {
      contentFrom: from,
      contentTo: to,
      documentSize,
      segments: documentSize
        ? [
            createTextSegment(
              0,
              from,
              to,
              source.slice(from, to),
              createIdentityBoundaries(from, documentSize),
            ),
          ]
        : [],
    },
    marks,
  };
};

const createUnmarkedLiteralStructure = (source: string): MarkedFragmentSourceStructure => ({
  map: {
    contentFrom: 0,
    contentTo: source.length,
    documentSize: source.length,
    segments: source
      ? [createTextSegment(0, 0, source.length, source, createIdentityBoundaries(0, source.length))]
      : [],
  },
  marks: [],
});

const getValidatedMarkdownChildren = (
  source: string,
  remark: RemarkParser,
  marks: readonly ProjectionMarkDescriptor[],
): MarkdownValidationResult => {
  const validationSource = withFootnoteDefinitions(source);
  let root: MarkdownNode;

  try {
    root = remark.parse(validationSource) as MarkdownNode;
    root = remark.runSync(root, validationSource) as MarkdownNode;
  } catch {
    return { type: "invalidOuter" };
  }

  const paragraph = root.type === "root" ? root.children?.[0] : undefined;

  if (paragraph?.type !== "paragraph" || paragraph.children?.length !== 1) {
    return { type: "invalidOuter" };
  }

  const expectedTypeList = marks.flatMap((mark) => {
    const type = MARKDOWN_MARK_TYPES.get(mark.markName);

    return type ? [type] : [];
  });
  const expectedTypes = new Set(expectedTypeList);
  const actualTypes = new Set<string>();
  let children = paragraph.children;

  while (
    children.length === 1 &&
    (children[0].type === "strong" ||
      children[0].type === "emphasis" ||
      children[0].type === "delete")
  ) {
    const candidate = children[0];

    actualTypes.add(candidate.type);
    children = candidate.children ?? [];
  }

  if (
    expectedTypeList.length !== marks.length ||
    actualTypes.size !== expectedTypes.size ||
    [...actualTypes].some((type) => !expectedTypes.has(type))
  ) {
    return { type: "invalidOuter" };
  }

  return children.length && children.every(isSupportedMarkedFragmentChild)
    ? { children, type: "structured" }
    : { type: "unsupportedInner" };
};

const isSupportedMarkedFragmentChild = (node: MarkdownNode): boolean => {
  if (
    node.type === "text" ||
    node.type === "footnoteReference" ||
    node.type === CHARACTER_REFERENCE_MARKDOWN_TYPE
  ) {
    return true;
  }

  const children = node.children ?? [];

  return node.type === "link" && children.length > 0 && children.every(isSupportedLinkChild);
};

// The source the serializer would write for this fragment, markers stripped. Escaping is decided
// from the whole line a run lands on, so the fragment is serialized once with its marks intact
// rather than a node at a time, and the markers are left to `createProjectionSource` so the
// projected form still follows the mark the document carries.
const getEscapedFragmentContent = (
  state: EditorState,
  serializer: Serializer,
  nodes: readonly ProseMirrorNode[],
  marks: ProjectionMarkDescriptor[],
) => {
  if (!nodes.length || marks.some((mark) => mark.markName === "inlineCode")) {
    return null;
  }

  const serialized = serializeLinkRunSource(state, serializer, nodes);
  const parsed = parseProjectionSource(serialized);

  if (
    parsed.type !== "mark" ||
    parsed.marks.length !== marks.length ||
    parsed.marks.some(({ markName }) => !marks.some((mark) => mark.markName === markName))
  ) {
    return null;
  }

  const { from, to } = getProjectionSourceContentBounds(serialized);

  return from < to ? serialized.slice(from, to) : null;
};

export const serializeMarkedFragmentSource = (
  state: EditorState,
  serializer: Serializer,
  remark: RemarkParser,
  content: Fragment,
  marks: ProjectionMarkDescriptor[],
): SerializedMarkedFragmentSource => {
  const nodes: ProseMirrorNode[] = [];

  content.forEach((node) => nodes.push(node));

  const wrappingMarkNames = new Set<string>(marks.map((mark) => mark.markName));
  const innerSources: string[] = [];
  const innerSegments: MarkedFragmentSourceSegment[] = [];
  let documentOffset = 0;
  let sourceOffset = 0;
  let index = 0;
  let escapedContent = getEscapedFragmentContent(state, serializer, nodes, marks);
  let escapedOffset = 0;

  while (index < nodes.length) {
    const node = nodes[index];
    const linkMark = getLinkMark(node);
    const runEnd = linkMark ? getLinkRunEnd(nodes, index, linkMark) : index + 1;
    const runNodes = nodes.slice(index, runEnd);
    const documentSize = runNodes.reduce((size, runNode) => size + runNode.nodeSize, 0);
    const isBreak = node.type.name === INLINE_BREAK_NODE_NAME;
    const referenceSource = linkMark ? null : getPreservedCharacterReferenceSource(node);
    const isPlainText = !linkMark && !referenceSource && node.isText;
    const escapedStart = escapedOffset;
    const text = isBreak ? "\n" : (node.text ?? "");
    // A run the serializer escaped spends source characters the document does not hold, so its
    // slice is read off the escaped content rather than off the node.
    const escapedTextBoundaries =
      isPlainText && escapedContent !== null
        ? readTextSourceBoundaries(escapedContent, escapedOffset, text)
        : null;
    const escapedText =
      escapedContent !== null && escapedTextBoundaries
        ? escapedContent.slice(
            escapedOffset,
            escapedTextBoundaries[escapedTextBoundaries.length - 1],
          )
        : null;
    const nodeSource = linkMark
      ? serializeLinkRunSource(
          state,
          serializer,
          runNodes.map((runNode) =>
            runNode.mark(runNode.marks.filter((mark) => !wrappingMarkNames.has(mark.type.name))),
          ),
        )
      : (referenceSource ??
        escapedText ??
        (node.isText
          ? text
          : isBreak
            ? "\n"
            : serializeFootnoteReference(state, serializer, node)));
    const sourceTo = sourceOffset + nodeSource.length;

    if (escapedContent !== null) {
      if (escapedTextBoundaries) {
        escapedOffset = escapedTextBoundaries[escapedTextBoundaries.length - 1];
      } else if (escapedContent.startsWith(nodeSource, escapedOffset)) {
        escapedOffset += nodeSource.length;
      } else {
        // The escaped content stopped describing this fragment, so every later run falls back to
        // the text the document holds rather than to an offset guessed against it.
        escapedContent = null;
      }
    }

    if (linkMark) {
      const map = createLinkSourceMap(remark, nodeSource);

      innerSegments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + documentSize,
        map: map?.documentSize === documentSize ? map : null,
        sourceFrom: sourceOffset,
        sourceTo,
        type: "link",
      });
    } else if (referenceSource) {
      innerSegments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + documentSize,
        sourceFrom: sourceOffset,
        sourceTo,
        type: "characterReference",
      });
    } else if (node.isText || isBreak) {
      innerSegments.push(
        createTextSegment(
          documentOffset,
          sourceOffset,
          sourceTo,
          text,
          // The walk ran over the fragment the serializer wrote, so its offsets are rebased onto
          // the source being joined here.
          escapedTextBoundaries?.map((boundary) => sourceOffset + boundary - escapedStart) ??
            createIdentityBoundaries(sourceOffset, text.length),
        ),
      );
    } else {
      const bounds = getFootnoteReferenceSourceBounds(nodeSource);

      if (!bounds) {
        throw new Error(`Expected a serializable footnote reference, received '${node.type.name}'`);
      }

      innerSegments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + documentSize,
        labelFrom: sourceOffset + bounds.labelFrom,
        labelTo: sourceOffset + bounds.labelTo,
        sourceFrom: sourceOffset,
        sourceTo,
        type: "footnoteReference",
      });
    }

    documentOffset += documentSize;
    sourceOffset = sourceTo;
    innerSources.push(nodeSource);
    index = runEnd;
  }

  const source = createProjectionSource(marks, innerSources.join(""));
  const { from, to } = getProjectionSourceContentBounds(source);
  const segments = innerSegments.map((segment) => ({
    ...segment,
    ...(segment.type === "footnoteReference"
      ? { labelFrom: segment.labelFrom + from, labelTo: segment.labelTo + from }
      : {}),
    ...(segment.type === "text"
      ? { sourceBoundaries: segment.sourceBoundaries.map((boundary) => boundary + from) }
      : {}),
    sourceFrom: segment.sourceFrom + from,
    sourceTo: segment.sourceTo + from,
  }));

  return {
    hasSourceOnlyContent: segments.some(
      (segment) =>
        segment.type !== "text" || segment.sourceTo - segment.sourceFrom !== segment.text.length,
    ),
    map: {
      contentFrom: from,
      contentTo: to,
      documentSize: documentOffset,
      segments,
    },
    source,
  };
};

export const createMarkedFragmentSourceStructure = (
  source: string,
  parser: Parser,
  remark: RemarkParser,
): MarkedFragmentSourceStructure | null => {
  const parsed = parseProjectionSource(source);

  if (parsed.type !== "mark" || parsed.marks.some((mark) => mark.markName === "inlineCode")) {
    return null;
  }

  const validation = getValidatedMarkdownChildren(source, remark, parsed.marks);

  if (validation.type === "invalidOuter") {
    return createUnmarkedLiteralStructure(source);
  }

  if (validation.type === "unsupportedInner") {
    return createMarkedLiteralStructure(source, parsed.marks);
  }

  const { children } = validation;

  const contentBounds = getProjectionSourceContentBounds(source);
  const segments: MarkedFragmentSourceSegment[] = [];
  let documentOffset = 0;
  let sourceOffset = contentBounds.from;

  for (const child of children) {
    const position = getMarkdownPosition(child);

    if (!position || position.from < sourceOffset || position.to > contentBounds.to) {
      return createMarkedLiteralStructure(source, parsed.marks);
    }

    documentOffset = addTextMapSegment(
      sourceOffset,
      position.from,
      segments,
      documentOffset,
      source,
    );

    if (child.type === "link") {
      const map = createLinkSourceMap(remark, source.slice(position.from, position.to));

      if (!map) {
        return createMarkedLiteralStructure(source, parsed.marks);
      }

      segments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + map.documentSize,
        map,
        sourceFrom: position.from,
        sourceTo: position.to,
        type: "link",
      });
      documentOffset += map.documentSize;
    } else if (child.type === CHARACTER_REFERENCE_MARKDOWN_TYPE) {
      const text = decodeWholeCharacterReference(source.slice(position.from, position.to));

      if (text === null) {
        return createMarkedLiteralStructure(source, parsed.marks);
      }

      segments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + text.length,
        sourceFrom: position.from,
        sourceTo: position.to,
        type: "characterReference",
      });
      documentOffset += text.length;
    } else if (child.type === "footnoteReference") {
      const referenceSource = source.slice(position.from, position.to);
      const reference = parseFootnoteReferenceSource(parser, referenceSource);
      const bounds = getFootnoteReferenceSourceBounds(referenceSource);

      if (!reference || !bounds) {
        return createMarkedLiteralStructure(source, parsed.marks);
      }

      segments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + reference.nodeSize,
        labelFrom: position.from + bounds.labelFrom,
        labelTo: position.from + bounds.labelTo,
        sourceFrom: position.from,
        sourceTo: position.to,
        type: "footnoteReference",
      });
      documentOffset += reference.nodeSize;
    } else {
      const value = typeof child.value === "string" ? child.value : "";
      const boundaries = readTextSourceBoundaries(source, position.from, value);

      if (!boundaries || boundaries[boundaries.length - 1] !== position.to) {
        return createMarkedLiteralStructure(source, parsed.marks);
      }

      segments.push(
        createTextSegment(documentOffset, position.from, position.to, value, boundaries),
      );
      documentOffset += value.length;
    }

    sourceOffset = position.to;
  }

  documentOffset = addTextMapSegment(
    sourceOffset,
    contentBounds.to,
    segments,
    documentOffset,
    source,
  );

  return {
    map: {
      contentFrom: contentBounds.from,
      contentTo: contentBounds.to,
      documentSize: documentOffset,
      segments,
    },
    marks: parsed.marks,
  };
};

export const parseMarkedFragmentSource = (
  state: EditorState,
  source: string,
  parser: Parser,
  remark: RemarkParser,
): ParsedMarkedFragmentSource | null => {
  const structure = createMarkedFragmentSourceStructure(source, parser, remark);

  if (!structure) {
    return null;
  }

  const documentMarks = createDocumentMarks(state, structure.marks);
  let isValid = true;
  const nodes = structure.map.segments.flatMap((segment) => {
    const segmentSource = source.slice(segment.sourceFrom, segment.sourceTo);

    if (segment.type === "text") {
      const node = createTextNode(state, segment.text, documentMarks);

      return node ? [node] : [];
    }

    if (segment.type === "link") {
      const linkNodes = parseLinkSourceNodes(
        state,
        parser,
        segmentSource,
        documentMarks,
        segment.documentTo - segment.documentFrom,
      );

      isValid &&= linkNodes !== null;

      return linkNodes ?? [];
    }

    if (segment.type === "characterReference") {
      const text = decodeWholeCharacterReference(segmentSource);

      isValid &&= text !== null;

      return text
        ? [
            state.schema.text(
              text,
              state.schema.marks[CHARACTER_REFERENCE_MARK_NAME]
                .create({ [CHARACTER_REFERENCE_SOURCE_ATTRIBUTE_NAME]: segmentSource })
                .addToSet(documentMarks),
            ),
          ]
        : [];
    }

    const reference = parseFootnoteReferenceSource(parser, segmentSource);

    return reference ? [reference.mark(documentMarks)] : [];
  });

  if (!isValid) {
    return null;
  }

  return {
    ...structure,
    replacement: nodes.length ? new Slice(Fragment.fromArray(nodes), 0, 0) : Slice.empty,
  };
};

export const mapMarkedFragmentDocumentOffsetToSource = (
  offset: number,
  map: MarkedFragmentSourceMap,
  association: -1 | 1 = 1,
) => {
  const normalizedOffset = Math.min(Math.max(offset, 0), map.documentSize);
  const matchingSegments = map.segments.filter(
    ({ documentFrom, documentTo }) =>
      documentFrom <= normalizedOffset && normalizedOffset <= documentTo,
  );
  const segment =
    (association < 0 ? matchingSegments[0] : matchingSegments.at(-1)) ?? map.segments.at(-1);

  if (!segment) {
    return map.contentFrom;
  }

  if (segment.type === "link") {
    return segment.map
      ? segment.sourceFrom +
          mapLinkDocumentPositionToSource(
            normalizedOffset - segment.documentFrom,
            segment.map,
            association,
          )
      : normalizedOffset <= segment.documentFrom
        ? segment.sourceFrom
        : segment.sourceTo;
  }

  if (segment.type === "characterReference" || segment.type === "footnoteReference") {
    return normalizedOffset <= segment.documentFrom ? segment.sourceFrom : segment.sourceTo;
  }

  return segment.sourceBoundaries[
    Math.min(
      Math.max(normalizedOffset - segment.documentFrom, 0),
      segment.sourceBoundaries.length - 1,
    )
  ];
};

export const mapMarkedFragmentSourceOffsetToDocument = (
  offset: number,
  map: MarkedFragmentSourceMap,
) => {
  if (offset <= map.contentFrom) {
    return 0;
  }

  if (offset >= map.contentTo) {
    return map.documentSize;
  }

  const segment = map.segments.find(
    ({ sourceFrom, sourceTo }) => sourceFrom <= offset && offset <= sourceTo,
  );

  if (!segment) {
    return offset - map.contentFrom;
  }

  if (segment.type === "link") {
    return segment.map
      ? segment.documentFrom +
          mapLinkSourcePositionToDocument(offset - segment.sourceFrom, segment.map)
      : offset - segment.sourceFrom < segment.sourceTo - offset
        ? segment.documentFrom
        : segment.documentTo;
  }

  if (segment.type === "characterReference") {
    return offset - segment.sourceFrom < segment.sourceTo - offset
      ? segment.documentFrom
      : segment.documentTo;
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
