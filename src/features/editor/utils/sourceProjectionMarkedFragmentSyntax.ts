import { Fragment, Slice, type Mark } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { MarkdownNode, Parser, RemarkParser, Serializer } from "@milkdown/kit/transformer";

import {
  getFootnoteReferenceSourceBounds,
  mapFootnoteReferenceSourceOffsetToDocument,
  parseFootnoteReferenceSource,
  serializeFootnoteReference,
} from "./sourceProjectionFootnoteReferenceSyntax";
import {
  createProjectionSource,
  getProjectionSourceContentBounds,
  parseProjectionSource,
  type ProjectionMarkDescriptor,
} from "./sourceProjectionSyntax";

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

interface MarkedFragmentTextSourceSegment extends MarkedFragmentSourceSegmentBase {
  type: "text";
}

export type MarkedFragmentSourceSegment =
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
  hasFootnoteReferences: boolean;
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

const createDocumentMarks = (state: EditorState, marks: readonly ProjectionMarkDescriptor[]) =>
  marks.map((mark) => state.schema.marks[mark.markName].create(mark.attrs));

const createTextNode = (state: EditorState, text: string, marks: readonly Mark[]) =>
  text ? state.schema.text(text, marks) : null;

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

  return children.length &&
    children.every((child) => child.type === "text" || child.type === "footnoteReference")
    ? { children, type: "structured" }
    : { type: "unsupportedInner" };
};

export const serializeMarkedFragmentSource = (
  state: EditorState,
  serializer: Serializer,
  content: Fragment,
  marks: ProjectionMarkDescriptor[],
): SerializedMarkedFragmentSource => {
  const innerSources: string[] = [];
  const innerSegments: MarkedFragmentSourceSegment[] = [];
  let documentOffset = 0;
  let sourceOffset = 0;
  let hasFootnoteReferences = false;

  content.forEach((node) => {
    const nodeSource = node.isText
      ? (node.text ?? "")
      : serializeFootnoteReference(state, serializer, node);
    const sourceTo = sourceOffset + nodeSource.length;

    if (node.isText) {
      innerSegments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + node.nodeSize,
        sourceFrom: sourceOffset,
        sourceTo,
        type: "text",
      });
    } else {
      const bounds = getFootnoteReferenceSourceBounds(nodeSource);

      if (!bounds) {
        throw new Error(`Expected a serializable footnote reference, received '${node.type.name}'`);
      }

      hasFootnoteReferences = true;
      innerSegments.push({
        documentFrom: documentOffset,
        documentTo: documentOffset + node.nodeSize,
        labelFrom: sourceOffset + bounds.labelFrom,
        labelTo: sourceOffset + bounds.labelTo,
        sourceFrom: sourceOffset,
        sourceTo,
        type: "footnoteReference",
      });
    }

    documentOffset += node.nodeSize;
    sourceOffset = sourceTo;
    innerSources.push(nodeSource);
  });

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
    hasFootnoteReferences,
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

    if (child.type === "footnoteReference") {
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
  const nodes = structure.map.segments.flatMap((segment) => {
    const segmentSource = source.slice(segment.sourceFrom, segment.sourceTo);

    if (segment.type === "text") {
      const node = createTextNode(state, segmentSource, documentMarks);

      return node ? [node] : [];
    }

    const reference = parseFootnoteReferenceSource(parser, segmentSource);

    return reference ? [reference.mark(documentMarks)] : [];
  });

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
