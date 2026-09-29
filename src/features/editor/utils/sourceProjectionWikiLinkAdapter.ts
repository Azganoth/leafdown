import {
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
} from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Parser } from "@milkdown/kit/transformer";

import {
  createLiteralSourceProjectionSlice,
  decodeSourceProjectionEscapes,
  isPlainTextRange,
  shouldHandleInlineObjectTextInput,
  type SourceProjectionAdapter,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";
import { mapSelectionPositionFromSourceProjection } from "./sourceProjectionSelection";
import { getTextBetween, type TextRange } from "./textRanges";
import { parseWikiLink, WIKI_LINK_NODE_NAME } from "./wikiLinkMarkdown";

interface WikiLinkTarget extends SourceProjectionTarget {
  adapterId: "wiki-link";
  ambientMarks: readonly Mark[];
}

const createTarget = (state: EditorState, node: ProseMirrorNode, from: number): WikiLinkTarget => ({
  adapterId: "wiki-link",
  ambientMarks: node.marks,
  from,
  to: from + node.nodeSize,
  originalContent: state.doc.slice(from, from + node.nodeSize),
  originalContentSize: node.nodeSize,
  originalSource: node.attrs.source as string,
});

const findTarget = (state: EditorState): WikiLinkTarget | null => {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === WIKI_LINK_NODE_NAME) {
    return createTarget(state, selection.node, selection.from);
  }
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$cursor) return null;
  const { nodeBefore, nodeAfter } = selection.$cursor;
  if (nodeAfter?.type.name === WIKI_LINK_NODE_NAME) {
    return createTarget(state, nodeAfter, selection.from);
  }
  return nodeBefore?.type.name === WIKI_LINK_NODE_NAME
    ? createTarget(state, nodeBefore, selection.from - nodeBefore.nodeSize)
    : null;
};

const parseSource = (parser: Parser, source: string): ProseMirrorNode | null => {
  if (!parseWikiLink(source)) return null;
  const document = parser(source);
  const paragraph = document.childCount === 1 ? document.firstChild : null;
  const node = paragraph?.childCount === 1 ? paragraph.firstChild : null;
  return node?.type.name === WIKI_LINK_NODE_NAME && node.attrs.source === source ? node : null;
};

const findLiteralCommit = (
  state: EditorState,
  range: TextRange,
): { from: number; to: number; replacement: Slice } | null => {
  const $from = state.doc.resolve(range.from);
  if (!$from.parent.isTextblock) return null;
  const start = $from.start();
  const text = getTextBetween($from.parent, 0, $from.parent.content.size);
  for (const match of text.matchAll(/\[\[[^\r\n]+?\]\]/gu)) {
    const from = start + match.index;
    const to = from + match[0].length;
    if (range.from > to || range.to < from || !parseWikiLink(match[0])) continue;
    if (match.index > 0 && text[match.index - 1] === "!") continue;
    if (!isPlainTextRange(state, from, to)) continue;
    const node = state.schema.nodes[WIKI_LINK_NODE_NAME].create({ source: match[0] });
    return { from, to, replacement: new Slice(Fragment.from(node), 0, 0) };
  }
  return null;
};

export const createWikiLinkSourceProjectionAdapter = (
  parser: Parser,
): SourceProjectionAdapter<WikiLinkTarget> => ({
  id: "wiki-link",
  findTarget,
  findLiteralSourceCommit: (state, range) => findLiteralCommit(state, range),
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  getPresentation: (_target, source) => ({
    previews: [],
    sourceTypes: ["wiki-link"],
    spans: parseWikiLink(source)
      ? [
          { className: "leafdown-source-projection__marker", from: 0, to: 2 },
          {
            className:
              "leafdown-source-projection__content leafdown-source-projection__content--link",
            from: 2,
            to: source.length - 2,
          },
          {
            className: "leafdown-source-projection__marker",
            from: source.length - 2,
            to: source.length,
          },
        ]
      : [],
  }),
  mapSelectionToSource: (selection, target, context) => {
    if (context.pointerSourceOffset !== null) {
      const position =
        target.from +
        Math.min(Math.max(context.pointerSourceOffset, 0), target.originalSource.length);
      return { anchor: position, head: position };
    }
    if (selection instanceof NodeSelection) {
      return { anchor: target.from + 2, head: target.from + target.originalSource.length - 2 };
    }
    const map = (position: number) =>
      position <= target.from
        ? position
        : target.from + target.originalSource.length + position - target.to;
    return { anchor: map(selection.anchor), head: map(selection.head) };
  },
  mapSelectionFromSource: (selection, session, result) => {
    const atomic = result.replacement.content.firstChild?.type.name === WIKI_LINK_NODE_NAME;
    const map = (position: number) => {
      const outside = mapSelectionPositionFromSourceProjection(position, session, result);
      if (outside !== null) return outside;
      return atomic ? session.from : position;
    };
    return { anchor: map(selection.anchor), head: map(selection.head) };
  },
  parseSource: (state, source, target) => {
    const node = parseSource(parser, source);
    const literal = decodeSourceProjectionEscapes(source);
    const replacement = node
      ? new Slice(Fragment.from(node.mark(target.ambientMarks)), 0, 0)
      : literal
        ? new Slice(Fragment.from(state.schema.text(literal, target.ambientMarks)), 0, 0)
        : Slice.empty;
    return { replacement, replacementSize: replacement.size, source };
  },
  canCopySelectionSemantically: (selection, session, parsed) =>
    parsed.replacement.content.firstChild?.type.name !== WIKI_LINK_NODE_NAME ||
    (selection.from === session.from && selection.to === session.to),
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, session.target.originalContent),
  shouldHandleTextInput: shouldHandleInlineObjectTextInput,
});
