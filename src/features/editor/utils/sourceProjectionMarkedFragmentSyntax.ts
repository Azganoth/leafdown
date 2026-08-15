import {
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
} from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { MarkdownNode, Parser, RemarkParser, Serializer } from "@milkdown/kit/transformer";

import { serializeLinkRunSource } from "./logicalLinkMarkdown";
import {
  getFootnoteReferenceSourceBounds,
  mapFootnoteReferenceSourceOffsetToDocument,
  parseFootnoteReferenceSource,
  serializeFootnoteReference,
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
  type: "text";
}

export type MarkedFragmentSourceSegment =
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
  hasInlineObjects: boolean;
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

const FOOTNOTE_REFERENCE_CANDIDATE_PATTERN = /\[\^(?:\\.|[^\]\\\r\n])+\]/gu;
const VALIDATION_DEFINITION_CONTENT = "Leafdown";
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
    document = parser(source);
  } catch {
    return null;
  }

  const paragraph = document.childCount === 1 ? document.firstChild : null;

  if (paragraph?.type !== state.schema.nodes.paragraph || paragraph.content.size !== documentSize) {
    return null;
  }

  const nodes: ProseMirrorNode[] = [];

  paragraph.forEach((node) =>
    nodes.push(node.mark(marks.reduce((markSet, mark) => mark.addToSet(markSet), node.marks))),
  );

  return nodes;
};

const addTextMapSegment = (
  sourceFrom: number,
  sourceTo: number,
  segments: MarkedFragmentSourceSegment[],
  documentOffset: number,
) => {
  if (sourceFrom >= sourceTo) {
    return documentOffset;
  }

  segments.push({
    documentFrom: documentOffset,
    documentTo: documentOffset + sourceTo - sourceFrom,
    sourceFrom,
    sourceTo,
    type: "text",
  });

  return documentOffset + sourceTo - sourceFrom;
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
            {
              documentFrom: 0,
              documentTo: documentSize,
              sourceFrom: from,
              sourceTo: to,
              type: "text",
            },
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
      ? [
          {
            documentFrom: 0,
            documentTo: source.length,
            sourceFrom: 0,
            sourceTo: source.length,
            type: "text",
          },
        ]
      : [],
  },
  marks: [],
});

const getValidatedMarkdownChildren = (
  source: string,
  parser: Parser,
  remark: RemarkParser,
  marks: readonly ProjectionMarkDescriptor[],
): MarkdownValidationResult => {
  const definitions = new Map<string, string>();

  for (const match of source.matchAll(FOOTNOTE_REFERENCE_CANDIDATE_PATTERN)) {
    const reference = parseFootnoteReferenceSource(parser, match[0]);

    if (reference) {
      definitions.set(
        String(reference.attrs.label),
        `${match[0]}: ${VALIDATION_DEFINITION_CONTENT}`,
      );
    }
  }

  const validationSource = definitions.size
    ? `${source}\n\n${[...definitions.values()].join("\n\n")}`
    : source;
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
  if (node.type === "text" || node.type === "footnoteReference") {
    return true;
  }

  const children = node.children ?? [];

  return node.type === "link" && children.length > 0 && children.every(isSupportedLinkChild);
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
  let hasInlineObjects = false;
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];
    const linkMark = getLinkMark(node);
    const runEnd = linkMark ? getLinkRunEnd(nodes, index, linkMark) : index + 1;
    const runNodes = nodes.slice(index, runEnd);
    const documentSize = runNodes.reduce((size, runNode) => size + runNode.nodeSize, 0);
    const isBreak = node.type.name === INLINE_BREAK_NODE_NAME;
    const nodeSource = linkMark
      ? serializeLinkRunSource(
          state,
          serializer,
          runNodes.map((runNode) =>
            runNode.mark(runNode.marks.filter((mark) => !wrappingMarkNames.has(mark.type.name))),
          ),
        )
      : node.isText
        ? (node.text ?? "")
        : isBreak
          ? "\n"
          : serializeFootnoteReference(state, serializer, node);
    const sourceTo = sourceOffset + nodeSource.length;

    if (linkMark) {
      const map = createLinkSourceMap(remark, nodeSource);

      hasInlineObjects = true;
      innerSegments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + documentSize,
        map: map?.documentSize === documentSize ? map : null,
        sourceFrom: sourceOffset,
        sourceTo,
        type: "link",
      });
    } else if (node.isText || isBreak) {
      innerSegments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + documentSize,
        sourceFrom: sourceOffset,
        sourceTo,
        type: "text",
      });
    } else {
      const bounds = getFootnoteReferenceSourceBounds(nodeSource);

      if (!bounds) {
        throw new Error(`Expected a serializable footnote reference, received '${node.type.name}'`);
      }

      hasInlineObjects = true;
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
    sourceFrom: segment.sourceFrom + from,
    sourceTo: segment.sourceTo + from,
  }));

  return {
    hasInlineObjects,
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

  const validation = getValidatedMarkdownChildren(source, parser, remark, parsed.marks);

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

    documentOffset = addTextMapSegment(sourceOffset, position.from, segments, documentOffset);

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
      documentOffset = addTextMapSegment(position.from, position.to, segments, documentOffset);
    }

    sourceOffset = position.to;
  }

  documentOffset = addTextMapSegment(sourceOffset, contentBounds.to, segments, documentOffset);

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
      const node = createTextNode(state, segmentSource, documentMarks);

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

  if (segment.type === "footnoteReference") {
    return normalizedOffset <= segment.documentFrom ? segment.sourceFrom : segment.sourceTo;
  }

  return segment.sourceFrom + normalizedOffset - segment.documentFrom;
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

  if (segment.type === "footnoteReference") {
    return (
      segment.documentFrom +
      mapFootnoteReferenceSourceOffsetToDocument(offset, {
        labelFrom: segment.labelFrom,
        labelTo: segment.labelTo,
      })
    );
  }

  return segment.documentFrom + offset - segment.sourceFrom;
};
