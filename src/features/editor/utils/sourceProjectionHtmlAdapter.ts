import {
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
} from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { Parser } from "@milkdown/kit/transformer";

import { parseSafeHtml } from "./safeHtml";
import {
  createLiteralSourceProjectionSlice,
  type SourceProjectionAdapter,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";

interface HtmlSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: "html";
  ambientMarks: readonly Mark[];
}

const createTarget = (
  state: EditorState,
  node: ProseMirrorNode,
  from: number,
): HtmlSourceProjectionTarget => ({
  adapterId: "html",
  ambientMarks: node.marks,
  from,
  to: from + node.nodeSize,
  originalContent: state.doc.slice(from, from + node.nodeSize),
  originalContentSize: node.nodeSize,
  originalSource: node.attrs.value as string,
});

const findTarget = (state: EditorState): HtmlSourceProjectionTarget | null => {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === "html") {
    return createTarget(state, selection.node, selection.from);
  }
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$cursor) {
    return null;
  }
  const { nodeAfter, nodeBefore } = selection.$cursor;
  if (nodeAfter?.type.name === "html") {
    return createTarget(state, nodeAfter, selection.from);
  }
  return nodeBefore?.type.name === "html"
    ? createTarget(state, nodeBefore, selection.from - nodeBefore.nodeSize)
    : null;
};

const parseHtmlSource = (parser: Parser, source: string): ProseMirrorNode | null => {
  if (!parseSafeHtml(source)) {
    return null;
  }
  const document = parser(source);
  const paragraph = document.childCount === 1 ? document.firstChild : null;
  const node =
    paragraph?.type.name === "paragraph" && paragraph.childCount === 1
      ? paragraph.firstChild
      : null;
  return node?.type.name === "html" && node.attrs.value === source ? node : null;
};

export const createHtmlSourceProjectionAdapter = (
  parser: Parser,
): SourceProjectionAdapter<HtmlSourceProjectionTarget> => ({
  id: "html",
  findTarget,
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  getPresentation: (_target, source) => ({
    previews: [],
    sourceTypes: ["html"],
    spans: source
      ? [{ className: "leafdown-source-projection__marker", from: 0, to: source.length }]
      : [],
  }),
  mapSelectionToSource: (selection, target, context) => {
    if (context.pointerSourceOffset !== null) {
      const position =
        target.from +
        Math.min(Math.max(context.pointerSourceOffset, 0), target.originalSource.length);
      return { anchor: position, head: position };
    }

    const map = (position: number) =>
      position <= target.from
        ? position
        : target.from + target.originalSource.length + (position - target.to);
    return selection instanceof NodeSelection
      ? { anchor: target.from, head: target.from + target.originalSource.length }
      : { anchor: map(selection.anchor), head: map(selection.head) };
  },
  mapSelectionFromSource: (selection, session, result) => {
    const atomic = result.replacement.content.firstChild?.type.name === "html";
    const map = (position: number) => {
      if (position <= session.from) return position;
      if (position >= session.to)
        return session.from + result.replacementSize + position - session.to;
      return atomic ? session.from : position;
    };
    return { anchor: map(selection.anchor), head: map(selection.head) };
  },
  parseSource: (state, source, { ambientMarks }) => {
    const node = parseHtmlSource(parser, source);
    const replacement = node
      ? new Slice(Fragment.from(node.mark(ambientMarks)), 0, 0)
      : source
        ? new Slice(Fragment.from(state.schema.text(source, ambientMarks)), 0, 0)
        : Slice.empty;
    return { replacement, replacementSize: replacement.size, source };
  },
  canCopySelectionSemantically: (selection, session, parsed) =>
    parsed.replacement.content.firstChild?.type.name !== "html" ||
    (selection.from === session.from && selection.to === session.to),
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, session.target.originalContent),
  getEnterKeyText: (event) => (!event.ctrlKey && !event.metaKey && !event.altKey ? "\n" : null),
});
