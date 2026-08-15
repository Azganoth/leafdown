import { Fragment, Mark, Slice, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Selection, Transaction } from "@milkdown/kit/prose/state";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Parser, RemarkParser, Serializer } from "@milkdown/kit/transformer";

import { isTruthy } from "@/lib/predicates";

import { serializeLinkRunSource } from "./logicalLinkMarkdown";
import { getCandidateMarksAtSelection, getMarkRangeAtSelection } from "./marks";
import {
  createLiteralSourceProjectionSlice,
  type SourceProjectionAdapter,
  type SourceProjectionPresentationSpan,
  type SourceProjectionSessionRange,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";
import {
  FOOTNOTE_REFERENCE_NODE_NAME,
  getFootnoteAugmentedParagraph,
  withFootnoteDefinitions,
} from "./sourceProjectionFootnoteReferenceSyntax";
import {
  createLinkSourceMap,
  isAtomicLinkSegment,
  mapLinkDocumentPositionToSource,
  mapLinkSourcePositionToDocument,
  type LinkSourceMap,
} from "./sourceProjectionLinkSyntax";
import { getTextBetween } from "./textRanges";

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

const isInlineSoftBreak = (node: ProseMirrorNode) =>
  node.type.name === "hardbreak" && node.attrs.isInline === true;

const isSupportedLinkNode = (node: ProseMirrorNode) =>
  node.isText ||
  isInlineSoftBreak(node) ||
  node.type.name === "image" ||
  node.type.name === FOOTNOTE_REFERENCE_NODE_NAME;

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

interface LinkProjectionTextEdit {
  from: number;
  text: string;
  to: number;
}

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
      !isSupportedLinkNode(node) ||
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
) =>
  serializeLinkRunSource(
    state,
    serializer,
    nodes.map((node) => node.mark(node.marks.filter((mark) => !mark.isInSet(ambientMarks)))),
  );

// A link nested inside a projected label produces source the label cannot describe.
const serializeInlineLinkSource = (
  state: EditorState,
  serializer: Serializer,
  fragment: Fragment,
) => {
  const nodes: ProseMirrorNode[] = [];
  let isSupported = fragment.childCount > 0;

  fragment.forEach((node) => {
    if (!isSupportedLinkNode(node)) {
      isSupported = false;
      return;
    }

    nodes.push(node.mark(node.marks.filter((mark) => mark.type.name !== LINK_MARK_NAME)));
  });

  if (!isSupported) {
    return null;
  }

  const paragraph = state.schema.nodes.paragraph.create(null, Fragment.fromArray(nodes));
  const document = state.schema.nodes.doc.create(null, paragraph);

  return serializer(document).replace(/\n$/u, "");
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
    nodes.push(node.mark(marks.reduce((set, mark) => mark.addToSet(set), node.marks)));
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
    document = parser(withFootnoteDefinitions(source));
  } catch {
    return null;
  }

  const paragraph = getFootnoteAugmentedParagraph(document);

  if (!paragraph?.isTextblock || paragraph.type !== state.schema.nodes.paragraph) {
    return null;
  }

  let linkMark: Mark | null = null;
  let isValid = paragraph.childCount > 0;

  paragraph.forEach((node) => {
    const nodeLinkMark = node.marks.find((mark) => mark.type.name === LINK_MARK_NAME) ?? null;

    if (
      !isSupportedLinkNode(node) ||
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

// Every node in a label stands for one document position, so the text has to spend one
// character on each of them to stay aligned with the source map's document offsets.
const getLinkContentText = (target: LinkSourceProjectionTarget) =>
  getTextBetween(target.originalContent.content, 0, target.originalContent.content.size);

const mergeCoincidentInsertions = (edits: readonly LinkProjectionTextEdit[]) => {
  const merged: LinkProjectionTextEdit[] = [];
  const insertions = new Map<number, LinkProjectionTextEdit>();

  for (const edit of edits) {
    if (edit.from !== edit.to) {
      merged.push(edit);
      continue;
    }

    const existing = insertions.get(edit.from);

    if (existing) {
      existing.text += edit.text;
      continue;
    }

    const insertion = { ...edit };

    insertions.set(edit.from, insertion);
    merged.push(insertion);
  }

  return merged;
};

const getLinkProjectionTextEdits = (target: LinkSourceProjectionTarget) => {
  const source = target.originalSource;
  const content = getLinkContentText(target);
  const enter: LinkProjectionTextEdit[] = [];
  const restore: LinkProjectionTextEdit[] = [];
  let previousSourceTo = 0;

  for (const segment of target.sourceMap.segments) {
    if (previousSourceTo < segment.sourceFrom) {
      const marker = source.slice(previousSourceTo, segment.sourceFrom);

      enter.push({ from: segment.documentFrom, text: marker, to: segment.documentFrom });
      restore.push({ from: previousSourceTo, text: "", to: segment.sourceFrom });
    }

    // A node maps as one span rather than character by character, and restoring it to the
    // text the document reads there holds the size the original content needs;
    // `createRestoreCleanLinkTransaction` swaps the node itself back in.
    if (segment.type !== "text") {
      enter.push({
        from: segment.documentFrom,
        text: source.slice(segment.sourceFrom, segment.sourceTo),
        to: segment.documentTo,
      });
      restore.push({
        from: segment.sourceFrom,
        text: content.slice(segment.documentFrom, segment.documentTo),
        to: segment.sourceTo,
      });
      previousSourceTo = segment.sourceTo;
      continue;
    }

    for (let offset = 0; offset < segment.documentTo - segment.documentFrom; offset += 1) {
      const documentFrom = segment.documentFrom + offset;
      const sourceFrom = segment.sourceBoundaries[offset];
      const sourceTo = segment.sourceBoundaries[offset + 1];
      const documentText = content.slice(documentFrom, documentFrom + 1);
      const sourceText = source.slice(sourceFrom, sourceTo);

      if (sourceText !== documentText) {
        const preservedTextOffset = sourceText.indexOf(documentText);

        if (preservedTextOffset >= 0) {
          const prefix = sourceText.slice(0, preservedTextOffset);
          const preservedSourceFrom = sourceFrom + preservedTextOffset;
          const preservedSourceTo = preservedSourceFrom + documentText.length;
          const suffix = sourceText.slice(preservedTextOffset + documentText.length);

          if (prefix) {
            enter.push({ from: documentFrom, text: prefix, to: documentFrom });
            restore.push({ from: sourceFrom, text: "", to: preservedSourceFrom });
          }

          if (suffix) {
            enter.push({ from: documentFrom + 1, text: suffix, to: documentFrom + 1 });
            restore.push({ from: preservedSourceTo, text: "", to: sourceTo });
          }

          continue;
        }

        enter.push({ from: documentFrom, text: sourceText, to: documentFrom + 1 });
        restore.push({ from: sourceFrom, text: documentText, to: sourceTo });
      }
    }

    previousSourceTo = segment.sourceTo;
  }

  if (previousSourceTo < source.length) {
    const marker = source.slice(previousSourceTo);

    enter.push({
      from: target.sourceMap.documentSize,
      text: marker,
      to: target.sourceMap.documentSize,
    });
    restore.push({ from: previousSourceTo, text: "", to: source.length });
  }

  return { enter: mergeCoincidentInsertions(enter), restore };
};

const applyLinkProjectionTextEdits = (
  transaction: Transaction,
  basePosition: number,
  edits: readonly LinkProjectionTextEdit[],
) => {
  const descendingEdits = [...edits].sort(
    (left, right) => right.from - left.from || right.to - left.to,
  );

  for (const edit of descendingEdits) {
    transaction.insertText(edit.text, basePosition + edit.from, basePosition + edit.to);
  }

  return transaction;
};

const addLinkTargetMarks = (
  transaction: Transaction,
  target: LinkSourceProjectionTarget,
  from: number,
) => {
  target.originalContent.content.forEach((node, offset) => {
    for (const mark of node.marks) {
      transaction.addMark(from + offset, from + offset + node.nodeSize, mark);
    }
  });

  return transaction;
};

const createEnterLinkProjectionTransaction = (
  state: EditorState,
  target: LinkSourceProjectionTarget,
) => {
  const transaction = state.tr.removeMark(target.from, target.to);
  const { enter } = getLinkProjectionTextEdits(target);

  return applyLinkProjectionTextEdits(transaction, target.from, enter);
};

const createRestoreCleanLinkTransaction = (
  state: EditorState,
  session: SourceProjectionSessionRange<LinkSourceProjectionTarget>,
) => {
  const { target } = session;
  const { restore } = getLinkProjectionTextEdits(target);
  const transaction = applyLinkProjectionTextEdits(state.tr, session.from, restore);

  addLinkTargetMarks(transaction, target, session.from);

  const restoredTo = session.from + target.originalContentSize;

  if (!transaction.doc.slice(session.from, restoredTo).eq(target.originalContent)) {
    transaction.replace(session.from, restoredTo, target.originalContent);
  }

  return transaction;
};

const mapSelectionPositionToSource = (
  position: number,
  target: LinkSourceProjectionTarget,
  association: -1 | 1,
) => {
  if (position < target.from) {
    return position;
  }

  if (position > target.to) {
    return target.from + target.originalSource.length + (position - target.to);
  }

  return (
    target.from +
    mapLinkDocumentPositionToSource(position - target.from, target.sourceMap, association)
  );
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

const isLinkSelectionSemantic = (
  selection: Selection,
  session: SourceProjectionSessionRange<LinkSourceProjectionTarget>,
  map: LinkSourceMap | null,
) => {
  if (!map) {
    return true;
  }

  const selectionFrom = selection.from - session.from;
  const selectionTo = selection.to - session.from;

  return map.segments.every((segment) => {
    if (!isAtomicLinkSegment(segment)) {
      return true;
    }

    const overlapsSelection = selectionFrom < segment.sourceTo && segment.sourceFrom < selectionTo;

    return (
      !overlapsSelection || (selectionFrom <= segment.sourceFrom && segment.sourceTo <= selectionTo)
    );
  });
};

const getLinkPresentationSpans = (source: string, map: LinkSourceMap) => {
  const spans: SourceProjectionPresentationSpan[] = [
    {
      className: "leafdown-source-projection__content--link-label",
      from: map.labelFrom,
      to: map.labelTo,
    },
  ];
  let markerFrom = 0;

  for (const segment of map.segments) {
    if (markerFrom < segment.sourceFrom) {
      spans.push({
        className: "leafdown-source-projection__marker",
        from: markerFrom,
        to: segment.sourceFrom,
      });
    }

    spans.push({
      className: segment.className,
      from: segment.sourceFrom,
      to: segment.sourceTo,
    });
    markerFrom = segment.sourceTo;
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
  ].filter(isTruthy);

  return {
    ...map,
    segments: map.segments.map((segment) => ({
      ...segment,
      className: [segment.className, ...classNames].join(" "),
    })),
    sourceTypes: [...new Set([...map.sourceTypes, ...ambientTypes])],
  };
};

export const createLinkSourceProjectionAdapter = ({
  parser,
  remark,
  serializer,
}: LinkAdapterDependencies): SourceProjectionAdapter<LinkSourceProjectionTarget> => ({
  id: LINK_ADAPTER_ID,
  // A partial soft break stays semantic, since the break and the characters it spans read the
  // same.
  canCopySelectionSemantically: (selection, session, parsed) =>
    isLinkSelectionSemantic(selection, session, createLinkSourceMap(remark, parsed.source)),
  createEnterTransaction: createEnterLinkProjectionTransaction,
  findTarget: (state) => findLinkTarget(state, serializer, remark),
  getPresentation: (linkTarget, source) => {
    const parsedMap = createLinkSourceMap(remark, source);
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
  mapSelectionToSource: (selection, linkTarget) => {
    const isForwardSelection = selection.anchor <= selection.head;
    const anchorAssociation = selection.empty || isForwardSelection ? 1 : -1;
    const headAssociation = selection.empty || !isForwardSelection ? 1 : -1;

    return {
      anchor: mapSelectionPositionToSource(selection.anchor, linkTarget, anchorAssociation),
      head: mapSelectionPositionToSource(selection.head, linkTarget, headAssociation),
    };
  },
  parseSource: (state, source, { ambientMarks }) => {
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
  restoreCleanTarget: createRestoreCleanLinkTransaction,
  serializeInlineSource: (state, fragment) =>
    serializeInlineLinkSource(state, serializer, fragment),
});
