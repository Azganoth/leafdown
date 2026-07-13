import { Fragment, Mark, Slice, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { Parser, RemarkParser, Serializer } from "@milkdown/kit/transformer";

import { isNonNullish } from "@/lib/predicates";

import { createLogicalLinkMarkdownSerializer } from "./logicalLinkMarkdown";
import { getCandidateMarksAtSelection, getMarkRangeAtSelection } from "./marks";
import {
  createLiteralSourceProjectionSlice,
  type SourceProjectionAdapter,
  type SourceProjectionPresentationSpan,
  type SourceProjectionSessionRange,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";
import {
  createLinkSourceMap,
  mapLinkDocumentPositionToSource,
  mapLinkSourcePositionToDocument,
  type LinkSourceMap,
} from "./sourceProjectionLinkSyntax";

const LINK_ADAPTER_ID = "link";
const LINK_MARK_NAME = "link";
const SUPPORTED_LINK_MARK_NAMES = new Set([
  "emphasis",
  "inlineCode",
  LINK_MARK_NAME,
  "strike_through",
  "strong",
]);
const OUTER_LINK_MARK_NAMES = new Set(["emphasis", "strike_through", "strong"]);

interface LinkSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: typeof LINK_ADAPTER_ID;
  ambientMarks: readonly Mark[];
  sourceMap: LinkSourceMap;
}

interface ParsedLinkSource {
  map: LinkSourceMap;
  replacement: Slice;
}

interface LinkAdapterDependencies {
  parser: Parser;
  remark: RemarkParser;
  serializer: Serializer;
}

const getLinkTarget = (target: SourceProjectionTarget): LinkSourceProjectionTarget => {
  if (target.adapterId !== LINK_ADAPTER_ID) {
    throw new Error(`Expected a link source-projection target, received '${target.adapterId}'`);
  }

  return target as LinkSourceProjectionTarget;
};

const getLinkNodes = (state: EditorState, from: number, to: number, linkMark: Mark) => {
  const { $from } = state.selection;
  const parentStart = $from.start();
  const nodes: ProseMirrorNode[] = [];
  let isSupported = true;

  $from.parent.forEach((node, offset) => {
    const nodeFrom = parentStart + offset;
    const nodeTo = nodeFrom + node.nodeSize;

    if (nodeTo <= from || to <= nodeFrom) {
      return;
    }

    if (
      nodeFrom < from ||
      to < nodeTo ||
      !node.isText ||
      !linkMark.isInSet(node.marks) ||
      node.marks.some((mark) => !SUPPORTED_LINK_MARK_NAMES.has(mark.type.name))
    ) {
      isSupported = false;
      return;
    }

    nodes.push(node);
  });

  return isSupported && nodes.length > 0 ? nodes : null;
};

const getAmbientLinkMarks = (
  state: EditorState,
  nodes: readonly ProseMirrorNode[],
  linkMark: Mark,
  from: number,
  to: number,
) => {
  const commonMarks = nodes[0].marks.filter(
    (mark) =>
      !mark.eq(linkMark) &&
      OUTER_LINK_MARK_NAMES.has(mark.type.name) &&
      nodes.every((node) => mark.isInSet(node.marks)),
  );

  return commonMarks.filter((mark) => {
    const range = getMarkRangeAtSelection(state, mark);

    return range?.from !== from || range.to !== to;
  });
};

const serializeLinkTarget = (
  state: EditorState,
  serializer: Serializer,
  nodes: readonly ProseMirrorNode[],
  ambientMarks: readonly Mark[],
) => {
  const content = Fragment.fromArray(
    nodes.map((node) => node.mark(node.marks.filter((mark) => !mark.isInSet(ambientMarks)))),
  );
  const paragraph = state.schema.nodes.paragraph.create(null, content);
  const document = state.schema.nodes.doc.create(null, paragraph);

  return createLogicalLinkMarkdownSerializer(serializer)(document).replace(/\n$/u, "");
};

const findLinkTarget = (
  state: EditorState,
  serializer: Serializer,
  remark: RemarkParser,
): LinkSourceProjectionTarget | null => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || selection.$from.parent !== selection.$to.parent) {
    return null;
  }

  const linkType = state.schema.marks.link;
  const linkMark = linkType
    ? (getCandidateMarksAtSelection(state).find((mark) => mark.type === linkType) ?? null)
    : null;
  const range = linkMark ? getMarkRangeAtSelection(state, linkMark) : null;

  if (!linkMark || !range || selection.from < range.from || range.to < selection.to) {
    return null;
  }

  const nodes = getLinkNodes(state, range.from, range.to, linkMark);

  if (!nodes) {
    return null;
  }

  const ambientMarks = getAmbientLinkMarks(state, nodes, linkMark, range.from, range.to);
  const originalSource = serializeLinkTarget(state, serializer, nodes, ambientMarks);
  const sourceMap = createLinkSourceMap(remark, originalSource);

  if (!sourceMap || sourceMap.documentSize !== range.to - range.from) {
    return null;
  }

  return {
    adapterId: LINK_ADAPTER_ID,
    ambientMarks,
    from: range.from,
    originalContent: state.doc.slice(range.from, range.to),
    originalContentSize: range.to - range.from,
    originalSource,
    sourceMap,
    to: range.to,
  };
};

const addMarksToFragment = (fragment: Fragment, marks: readonly Mark[]) => {
  if (!marks.length) {
    return fragment;
  }

  const nodes: ProseMirrorNode[] = [];

  fragment.forEach((node) => {
    nodes.push(
      node.isText ? node.mark(marks.reduce((set, mark) => mark.addToSet(set), node.marks)) : node,
    );
  });

  return Fragment.fromArray(nodes);
};

const parseLinkSource = (
  state: EditorState,
  source: string,
  parser: Parser,
  remark: RemarkParser,
  ambientMarks: readonly Mark[],
): ParsedLinkSource | null => {
  const map = createLinkSourceMap(remark, source);

  if (!map) {
    return null;
  }

  let document: ProseMirrorNode;

  try {
    document = parser(source);
  } catch {
    return null;
  }

  const paragraph = document.childCount === 1 ? document.firstChild : null;

  if (!paragraph?.isTextblock || paragraph.type !== state.schema.nodes.paragraph) {
    return null;
  }

  let linkMark: Mark | null = null;
  let isValid = paragraph.childCount > 0;

  paragraph.forEach((node) => {
    const nodeLinkMark = node.marks.find((mark) => mark.type.name === LINK_MARK_NAME) ?? null;

    if (
      !node.isText ||
      !nodeLinkMark ||
      (linkMark !== null && !linkMark.eq(nodeLinkMark)) ||
      node.marks.some((mark) => !SUPPORTED_LINK_MARK_NAMES.has(mark.type.name))
    ) {
      isValid = false;
      return;
    }

    linkMark ??= nodeLinkMark;
  });

  if (!isValid || !linkMark || paragraph.content.size !== map.documentSize) {
    return null;
  }

  const content = addMarksToFragment(paragraph.content, ambientMarks);

  return {
    map,
    replacement: new Slice(content, 0, 0),
  };
};

const mapSelectionPositionToSource = (position: number, target: LinkSourceProjectionTarget) => {
  if (position < target.from) {
    return position;
  }

  if (position > target.to) {
    return target.from + target.originalSource.length + (position - target.to);
  }

  return target.from + mapLinkDocumentPositionToSource(position - target.from, target.sourceMap);
};

const mapSelectionPositionFromSource = (
  position: number,
  session: SourceProjectionSessionRange,
  source: string,
  map: LinkSourceMap | null,
) => {
  if (position <= session.from) {
    return position;
  }

  if (position >= session.to) {
    return session.from + (map?.documentSize ?? source.length) + (position - session.to);
  }

  const sourceOffset = position - session.from;

  return session.from + (map ? mapLinkSourcePositionToDocument(sourceOffset, map) : sourceOffset);
};

const getLinkPresentationSpans = (source: string, map: LinkSourceMap) => {
  const spans: SourceProjectionPresentationSpan[] = [];
  let markerFrom = 0;

  for (const leaf of map.leaves) {
    if (markerFrom < leaf.sourceFrom) {
      spans.push({
        className: "leafdown-source-projection__marker",
        from: markerFrom,
        to: leaf.sourceFrom,
      });
    }

    spans.push({ className: leaf.className, from: leaf.sourceFrom, to: leaf.sourceTo });
    markerFrom = leaf.sourceTo;
  }

  if (markerFrom < source.length) {
    spans.push({
      className: "leafdown-source-projection__marker",
      from: markerFrom,
      to: source.length,
    });
  }

  return spans;
};

const getLinkPresentationMap = (
  map: LinkSourceMap,
  ambientMarks: readonly Mark[],
): LinkSourceMap => {
  const ambientTypes = ambientMarks.map((mark) => mark.type.name);

  if (!ambientTypes.length) {
    return map;
  }

  const classNames = [
    ambientTypes.includes("strong") && "leafdown-source-projection__content--strong",
    ambientTypes.includes("emphasis") && "leafdown-source-projection__content--emphasis",
    ambientTypes.includes("strike_through") && "leafdown-source-projection__content--strikethrough",
  ].filter(isNonNullish);

  return {
    ...map,
    leaves: map.leaves.map((leaf) => ({
      ...leaf,
      className: [leaf.className, ...classNames].join(" "),
    })),
    sourceTypes: [...new Set([...map.sourceTypes, ...ambientTypes])],
  };
};

export const createLinkSourceProjectionAdapter = ({
  parser,
  remark,
  serializer,
}: LinkAdapterDependencies): SourceProjectionAdapter => ({
  id: LINK_ADAPTER_ID,
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  findTarget: (state) => findLinkTarget(state, serializer, remark),
  getPresentation: (target, source) => {
    const parsedMap = createLinkSourceMap(remark, source);
    const linkTarget = getLinkTarget(target);
    const map = getLinkPresentationMap(parsedMap ?? linkTarget.sourceMap, linkTarget.ambientMarks);

    return {
      sourceTypes: map.sourceTypes,
      spans: parsedMap ? getLinkPresentationSpans(source, map) : [],
    };
  },
  mapSelectionFromSource: (selection, session, result) => {
    const map = createLinkSourceMap(remark, result.source);

    return {
      anchor: mapSelectionPositionFromSource(selection.anchor, session, result.source, map),
      head: mapSelectionPositionFromSource(selection.head, session, result.source, map),
    };
  },
  mapSelectionToSource: (selection, target) => {
    const linkTarget = getLinkTarget(target);

    return {
      anchor: mapSelectionPositionToSource(selection.anchor, linkTarget),
      head: mapSelectionPositionToSource(selection.head, linkTarget),
    };
  },
  parseSource: (state, source, target) => {
    const ambientMarks = getLinkTarget(target).ambientMarks;
    const parsed = parseLinkSource(state, source, parser, remark, ambientMarks);

    return parsed
      ? {
          replacement: parsed.replacement,
          replacementSize: parsed.map.documentSize,
          source,
        }
      : {
          replacement: createLiteralSourceProjectionSlice(state, source),
          replacementSize: source.length,
          source,
        };
  },
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, getLinkTarget(session.target).originalContent),
});
