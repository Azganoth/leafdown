import {
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
} from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Parser } from "@milkdown/kit/transformer";

import { parseCitationGroup, type CitationSourceRange } from "./citationSyntax";
import {
  createLiteralSourceProjectionSlice,
  decodeSourceProjectionEscapes,
  isPlainTextRange,
  shouldHandleInlineObjectTextInput,
  type SourceProjectionAdapter,
  type SourceProjectionPresentationSpan,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";
import {
  getAugmentedParagraph,
  getDocumentDefinitionSources,
  withProjectionDefinitions,
} from "./sourceProjectionDefinitions";
import { mapSelectionPositionFromSourceProjection } from "./sourceProjectionSelection";
import { getTextBetween, type TextRange } from "./textRanges";

const CITATION_NODE_NAME = "citation";
const MARKER_CLASS_NAME = "leafdown-source-projection__marker";
const KEY_CLASS_NAME =
  "leafdown-source-projection__content leafdown-source-projection__content--citation-key";
const AFFIX_CLASS_NAME = "leafdown-source-projection__content";

interface CitationSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: "citation";
  ambientMarks: readonly Mark[];
  definitions: readonly string[];
}

const createTarget = (
  state: EditorState,
  node: ProseMirrorNode,
  from: number,
): CitationSourceProjectionTarget => ({
  adapterId: "citation",
  ambientMarks: node.marks,
  definitions: getDocumentDefinitionSources(state.doc),
  from,
  to: from + node.nodeSize,
  originalContent: state.doc.slice(from, from + node.nodeSize),
  originalContentSize: node.nodeSize,
  originalSource: node.attrs.value as string,
});

const findTarget = (state: EditorState): CitationSourceProjectionTarget | null => {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === CITATION_NODE_NAME) {
    return createTarget(state, selection.node, selection.from);
  }
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$cursor) return null;
  const { nodeAfter, nodeBefore } = selection.$cursor;
  if (nodeAfter?.type.name === CITATION_NODE_NAME) {
    return createTarget(state, nodeAfter, selection.from);
  }
  return nodeBefore?.type.name === CITATION_NODE_NAME
    ? createTarget(state, nodeBefore, selection.from - nodeBefore.nodeSize)
    : null;
};

// Source commits as a citation only where the file would read the group back as one, which the
// document's definitions decide too: a group whose label one of them names is a link instead. Text
// after the group is read along with it, since a link tail there would also claim the group.
const parseCitationSource = (
  parser: Parser,
  source: string,
  definitions: readonly string[],
  after = "",
): ProseMirrorNode | null => {
  if (!parseCitationGroup(source)) return null;
  const paragraph = getAugmentedParagraph(
    parser(withProjectionDefinitions(source + after, definitions)),
  );
  const node = paragraph?.firstChild;
  return node?.type.name === CITATION_NODE_NAME && node.attrs.value === source ? node : null;
};

const markerSpan = ({ from, to }: CitationSourceRange): SourceProjectionPresentationSpan => ({
  className: MARKER_CLASS_NAME,
  from,
  to,
});

export const getCitationSourceSpans = (source: string): SourceProjectionPresentationSpan[] => {
  const items = parseCitationGroup(source);
  if (!items) return [];
  const spans: SourceProjectionPresentationSpan[] = [markerSpan({ from: 0, to: 1 })];
  const affix = (range: CitationSourceRange) => {
    if (range.to > range.from) spans.push({ className: AFFIX_CLASS_NAME, ...range });
  };
  items.forEach((item, index) => {
    if (index > 0) spans.push(markerSpan({ from: item.prefix.from - 1, to: item.prefix.from }));
    affix(item.prefix);
    spans.push(markerSpan(item.marker));
    if (item.braced)
      spans.push(markerSpan({ from: item.keyRange.from - 1, to: item.keyRange.from }));
    spans.push({ className: KEY_CLASS_NAME, ...item.keyRange });
    if (item.braced) spans.push(markerSpan({ from: item.keyRange.to, to: item.keyRange.to + 1 }));
    if (item.locator) {
      spans.push(markerSpan({ from: item.locator.from - 1, to: item.locator.from }));
      affix(item.locator);
      spans.push(markerSpan({ from: item.locator.to, to: item.locator.to + 1 }));
    }
    affix(item.suffix);
  });
  spans.push(markerSpan({ from: source.length - 1, to: source.length }));
  return spans;
};

const GROUP_CANDIDATE_PATTERN = /\[[^\]]*\]/gu;

const findLiteralCommit = (
  state: EditorState,
  parser: Parser,
  range: TextRange,
): { from: number; to: number; replacement: Slice } | null => {
  const $from = state.doc.resolve(range.from);
  if (!$from.parent.isTextblock) return null;
  const start = $from.start();
  const text = getTextBetween($from.parent, 0, $from.parent.content.size);
  let definitions: readonly string[] | undefined;
  for (const match of text.matchAll(GROUP_CANDIDATE_PATTERN)) {
    const from = start + match.index;
    const to = from + match[0].length;
    if (range.from > to || range.to < from || !parseCitationGroup(match[0])) continue;
    if (match.index > 0 && (text[match.index - 1] === "!" || text[match.index - 1] === "\\"))
      continue;
    if (!isPlainTextRange(state, from, to)) continue;
    definitions ??= getDocumentDefinitionSources(state.doc);
    const after = text.slice(match.index + match[0].length).split("\n", 1)[0];
    const node = parseCitationSource(parser, match[0], definitions, after);
    if (!node) continue;
    return { from, to, replacement: new Slice(Fragment.from(node), 0, 0) };
  }
  return null;
};

export const createCitationSourceProjectionAdapter = (
  parser: Parser,
): SourceProjectionAdapter<CitationSourceProjectionTarget> => ({
  id: "citation",
  findTarget,
  findLiteralSourceCommit: (state, range) => findLiteralCommit(state, parser, range),
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  getPresentation: (_target, source) => ({
    previews: [],
    sourceTypes: ["citation"],
    spans: getCitationSourceSpans(source),
  }),
  mapSelectionToSource: (selection, target, context) => {
    const sourceEnd = target.from + target.originalSource.length;
    if (context.pointerSourceOffset !== null) {
      const position =
        target.from +
        Math.min(Math.max(context.pointerSourceOffset, 0), target.originalSource.length);
      return { anchor: position, head: position };
    }
    if (selection instanceof NodeSelection) return { anchor: target.from, head: sourceEnd };
    if (context.direction === "forward") return { anchor: target.from, head: target.from };
    if (context.direction === "backward") return { anchor: sourceEnd, head: sourceEnd };
    const map = (position: number) =>
      position <= target.from ? position : sourceEnd + position - target.to;
    return { anchor: map(selection.anchor), head: map(selection.head) };
  },
  mapSelectionFromSource: (selection, session, result) => {
    const atomic = result.replacement.content.firstChild?.type.name === CITATION_NODE_NAME;
    const map = (position: number) => {
      const outside = mapSelectionPositionFromSourceProjection(position, session, result);
      if (outside !== null) return outside;
      return atomic ? session.from : position;
    };
    return { anchor: map(selection.anchor), head: map(selection.head) };
  },
  parseSource: (state, source, target) => {
    const node = parseCitationSource(parser, source, target.definitions);
    const literal = decodeSourceProjectionEscapes(source);
    const replacement = node
      ? new Slice(Fragment.from(node.mark(target.ambientMarks)), 0, 0)
      : literal
        ? new Slice(Fragment.from(state.schema.text(literal, target.ambientMarks)), 0, 0)
        : Slice.empty;
    return { replacement, replacementSize: replacement.size, source };
  },
  canCopySelectionSemantically: (selection, session, parsed) =>
    parsed.replacement.content.firstChild?.type.name !== CITATION_NODE_NAME ||
    (selection.from === session.from && selection.to === session.to),
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, session.target.originalContent),
  shouldHandleTextInput: shouldHandleInlineObjectTextInput,
});
