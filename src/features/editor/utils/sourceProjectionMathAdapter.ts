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
  type SourceProjectionAdapter,
  type SourceProjectionTarget,
} from "./sourceProjectionAdapters";

const MATH_NODE_NAME = "math_inline";

interface MathSourceProjectionTarget extends SourceProjectionTarget {
  adapterId: "math";
  ambientMarks: readonly Mark[];
}

const createTarget = (
  state: EditorState,
  node: ProseMirrorNode,
  from: number,
): MathSourceProjectionTarget => ({
  adapterId: "math",
  ambientMarks: node.marks,
  from,
  to: from + node.nodeSize,
  originalContent: state.doc.slice(from, from + node.nodeSize),
  originalContentSize: node.nodeSize,
  originalSource: node.attrs.value as string,
});

const findTarget = (state: EditorState): MathSourceProjectionTarget | null => {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type.name === MATH_NODE_NAME) {
    return createTarget(state, selection.node, selection.from);
  }
  if (!(selection instanceof TextSelection) || !selection.empty || !selection.$cursor) {
    return null;
  }
  const { nodeAfter, nodeBefore } = selection.$cursor;
  if (nodeAfter?.type.name === MATH_NODE_NAME) {
    return createTarget(state, nodeAfter, selection.from);
  }
  return nodeBefore?.type.name === MATH_NODE_NAME
    ? createTarget(state, nodeBefore, selection.from - nodeBefore.nodeSize)
    : null;
};

// Source commits as math only when the file would read it back as exactly one math span; anything
// else becomes the literal text it spells, so no character typed in the source is lost.
const parseMathSource = (parser: Parser, source: string): ProseMirrorNode | null => {
  const document = parser(source);
  const paragraph = document.childCount === 1 ? document.firstChild : null;
  const node =
    paragraph?.type.name === "paragraph" && paragraph.childCount === 1
      ? paragraph.firstChild
      : null;
  return node?.type.name === MATH_NODE_NAME && node.attrs.value === source ? node : null;
};

export const createMathSourceProjectionAdapter = (
  parser: Parser,
): SourceProjectionAdapter<MathSourceProjectionTarget> => ({
  id: "math",
  findTarget,
  createEnterTransaction: (state, target) =>
    state.tr.replace(
      target.from,
      target.to,
      createLiteralSourceProjectionSlice(state, target.originalSource),
    ),
  getPresentation: (_target, source) => ({
    previews: [],
    sourceTypes: ["math"],
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
    const atomic = result.replacement.content.firstChild?.type.name === MATH_NODE_NAME;
    const map = (position: number) => {
      if (position <= session.from) return position;
      if (position >= session.to)
        return session.from + result.replacementSize + position - session.to;
      return atomic ? session.from : position;
    };
    return { anchor: map(selection.anchor), head: map(selection.head) };
  },
  parseSource: (state, source, { ambientMarks }) => {
    const node = parseMathSource(parser, source);
    const replacement = node
      ? new Slice(Fragment.from(node.mark(ambientMarks)), 0, 0)
      : source
        ? new Slice(Fragment.from(state.schema.text(source, ambientMarks)), 0, 0)
        : Slice.empty;
    return { replacement, replacementSize: replacement.size, source };
  },
  canCopySelectionSemantically: (selection, session, parsed) =>
    parsed.replacement.content.firstChild?.type.name !== MATH_NODE_NAME ||
    (selection.from === session.from && selection.to === session.to),
  restoreCleanTarget: (state, session) =>
    state.tr.replace(session.from, session.to, session.target.originalContent),
  getEnterKeyText: (event) => (!event.ctrlKey && !event.metaKey && !event.altKey ? "\n" : null),
});
