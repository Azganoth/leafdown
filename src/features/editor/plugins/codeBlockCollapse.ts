import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import {
  AllSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { collectChangedRanges } from "../utils/changedRanges";
import {
  createCodeBlockDecorations,
  removeDecorationsWithin,
  updateCodeBlockDecorations,
} from "../utils/codeBlockDecorations";

export const COLLAPSED_CODE_LINES = 8;
// A block collapses only when it hides at least this many lines, so the control never stands in
// for a single line it could have shown.
const MINIMUM_HIDDEN_CODE_LINES = 2;

interface CodeBlockCollapseState {
  collapsed: readonly number[];
  decorations: DecorationSet;
}

interface CodeBlockCollapseMeta {
  collapse?: number;
  expand?: readonly number[];
  reveal?: { from: number; to: number };
}

export type CodeBlockCollapse = "collapsed" | "expanded";

export const codeBlockCollapsePluginKey = new PluginKey<CodeBlockCollapseState>(
  "leafdownCodeBlockCollapse",
);

const isCodeBlock = (node: ProseMirrorNode | null | undefined) => node?.type.name === "code_block";

// The offset of the line ending that closes the last line a collapsed block shows, or null when
// the block is too short to collapse. A code block holds unmarked text only, so its string offsets
// are document offsets from its content start.
const findCollapseBoundary = (node: ProseMirrorNode) => {
  const text = node.textContent;
  let boundary = -1;
  for (let line = 0; line < COLLAPSED_CODE_LINES; line += 1) {
    boundary = text.indexOf("\n", boundary + 1);
    if (boundary === -1) return null;
  }
  let next = boundary;
  for (let line = 1; line < MINIMUM_HIDDEN_CODE_LINES; line += 1) {
    next = text.indexOf("\n", next + 1);
    if (next === -1) return null;
  }
  return boundary;
};

export const isCollapsibleCodeBlock = (node: ProseMirrorNode) =>
  isCodeBlock(node) && findCollapseBoundary(node) !== null;

export const countCollapsedCodeLines = (node: ProseMirrorNode) =>
  node.textContent.split("\n").length - COLLAPSED_CODE_LINES;

// The hidden lines run from just after the last shown line's end to the end of the code, so a
// caret at the end of the last shown line stays visible.
const getHiddenRange = (node: ProseMirrorNode, position: number) => {
  const boundary = findCollapseBoundary(node);
  if (boundary === null) return null;
  const contentStart = position + 1;
  return { from: contentStart + boundary, to: contentStart + node.content.size };
};

const isInsideHiddenRange = (range: { from: number; to: number }, position: number) =>
  position > range.from && position <= range.to;

export const getCollapsedCodeBlocks = (state: EditorState): readonly number[] =>
  codeBlockCollapsePluginKey.getState(state)?.collapsed ?? [];

const decorateCodeBlock =
  (collapsed: ReadonlySet<number>) => (node: ProseMirrorNode, position: number) => {
    const hidden = getHiddenRange(node, position);
    if (!hidden) return [];
    const state: CodeBlockCollapse = collapsed.has(position) ? "collapsed" : "expanded";
    const decorations = [
      Decoration.node(
        position,
        position + node.nodeSize,
        { "data-leafdown-code-collapse": state },
        { leafdownCodeCollapse: state },
      ),
    ];
    if (state === "collapsed") {
      decorations.push(
        Decoration.inline(hidden.from, hidden.to, { class: "leafdown-code-collapsed-lines" }),
      );
    }
    return decorations;
  };

export const readCodeBlockCollapse = (
  decorations: readonly Decoration[],
): CodeBlockCollapse | null => {
  for (const decoration of decorations) {
    const state = (decoration.spec as { leafdownCodeCollapse?: CodeBlockCollapse })
      .leafdownCodeCollapse;
    if (state) return state;
  }
  return null;
};

// The block's content start survives a change to its fence, and is deleted with the block, so a
// collapse never passes to a neighbouring block.
const mapCollapsedBlock = (transaction: Transaction, position: number) => {
  const result = transaction.mapping.mapResult(position + 1, 1);
  if (result.deleted) return null;
  const $content = transaction.doc.resolve(result.pos);
  return isCodeBlock($content.parent) ? $content.before() : null;
};

const sameBlocks = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((position, index) => position === right[index]);

const hiddenRangeAt = (doc: ProseMirrorNode, collapsed: readonly number[], position: number) => {
  const $position = doc.resolve(position);
  if (!isCodeBlock($position.parent)) return null;
  const block = $position.before();
  if (!collapsed.includes(block)) return null;
  const hidden = getHiddenRange($position.parent, block);
  return hidden && isInsideHiddenRange(hidden, position) ? block : null;
};

// A selection that only passes over hidden lines, such as Select all, leaves them collapsed; one
// whose end lands on a hidden line cannot be seen there and expands its block.
const findReachedBlocks = (
  doc: ProseMirrorNode,
  collapsed: readonly number[],
  from: number,
  to: number,
) =>
  [...new Set([hiddenRangeAt(doc, collapsed, from), hiddenRangeAt(doc, collapsed, to)])].flatMap(
    (block) => (block === null ? [] : [block]),
  );

const selectionReachedBlocks = (state: EditorState, collapsed: readonly number[]) =>
  state.selection instanceof AllSelection
    ? []
    : findReachedBlocks(state.doc, collapsed, state.selection.from, state.selection.to);

const applyCollapseTransaction = (
  transaction: Transaction,
  value: CodeBlockCollapseState,
): CodeBlockCollapseState => {
  const meta = transaction.getMeta(codeBlockCollapsePluginKey) as CodeBlockCollapseMeta | undefined;
  if (!transaction.docChanged && !meta) return value;

  const { doc } = transaction;
  const mapped = transaction.docChanged
    ? value.collapsed.flatMap((position) => mapCollapsedBlock(transaction, position) ?? [])
    : value.collapsed;
  let collapsed = [...mapped];

  if (meta?.collapse !== undefined) collapsed.push(meta.collapse);
  if (meta?.expand) collapsed = collapsed.filter((position) => !meta.expand!.includes(position));
  if (meta?.reveal) {
    const reached = findReachedBlocks(doc, collapsed, meta.reveal.from, meta.reveal.to);
    collapsed = collapsed.filter((position) => !reached.includes(position));
  }

  // Only a block an edit touched can have grown too short to collapse.
  const changed = transaction.docChanged ? collectChangedRanges(transaction) : [];
  const normalized = [...new Set(collapsed)]
    .filter((position) => {
      const node = doc.nodeAt(position);
      if (!node || !isCodeBlock(node)) return false;
      const touched = changed.some(
        ([from, to]) => from <= position + node.nodeSize && to >= position,
      );
      return !touched || isCollapsibleCodeBlock(node);
    })
    .toSorted((left, right) => left - right);

  if (!transaction.docChanged && sameBlocks(normalized, value.collapsed)) return value;

  const collapsedSet = new Set(normalized);
  const decorate = decorateCodeBlock(collapsedSet);
  let decorations = updateCodeBlockDecorations(transaction, value.decorations, decorate);
  const mappedSet = new Set(mapped);
  const toggled = [
    ...mapped.filter((position) => !collapsedSet.has(position)),
    ...normalized.filter((position) => !mappedSet.has(position)),
  ];
  for (const position of toggled) {
    const node = doc.nodeAt(position);
    if (!node) continue;
    decorations = removeDecorationsWithin(decorations, position, position + node.nodeSize).add(
      doc,
      decorate(node, position),
    );
  }

  return { collapsed: normalized, decorations };
};

const createInitialState = (doc: ProseMirrorNode): CodeBlockCollapseState => {
  const collapsed: number[] = [];
  doc.descendants((node, position) => {
    if (isCodeBlock(node)) {
      if (isCollapsibleCodeBlock(node)) collapsed.push(position);
      return false;
    }
    return !node.isTextblock;
  });
  return {
    collapsed,
    decorations: createCodeBlockDecorations(doc, decorateCodeBlock(new Set(collapsed))),
  };
};

export const revealCollapsedCodeRange = (transaction: Transaction, from: number, to = from) =>
  transaction.setMeta(codeBlockCollapsePluginKey, {
    reveal: { from, to },
  } satisfies CodeBlockCollapseMeta);

export const expandCodeBlock = (view: EditorView, position: number) => {
  if (!getCollapsedCodeBlocks(view.state).includes(position)) return false;
  view.dispatch(
    view.state.tr.setMeta(codeBlockCollapsePluginKey, {
      expand: [position],
    } satisfies CodeBlockCollapseMeta),
  );
  return true;
};

const selectionLeavingBlock = (state: EditorState, position: number, node: ProseMirrorNode) => {
  const hidden = getHiddenRange(node, position);
  if (!hidden) return null;
  const { from, to } = state.selection;
  return isInsideHiddenRange(hidden, from) || isInsideHiddenRange(hidden, to)
    ? TextSelection.create(state.doc, hidden.from)
    : null;
};

// A collapse that would hide the caret or selection moves the caret to the end of the last line
// the block still shows.
export const collapseCodeBlock = (view: EditorView, position: number) => {
  const { state } = view;
  const node = state.doc.nodeAt(position);
  if (!node || !isCollapsibleCodeBlock(node) || getCollapsedCodeBlocks(state).includes(position)) {
    return false;
  }
  const transaction = state.tr.setMeta(codeBlockCollapsePluginKey, {
    collapse: position,
  } satisfies CodeBlockCollapseMeta);
  const selection = selectionLeavingBlock(state, position, node);
  if (selection) transaction.setSelection(selection).scrollIntoView();
  view.dispatch(transaction);
  return true;
};

const findCollapseTarget = (state: EditorState) => {
  const { selection } = state;
  if (selection instanceof AllSelection) return null;
  const { $from, $to } = selection;
  if (!isCodeBlock($from.parent) || !$from.sameParent($to)) return null;
  return isCollapsibleCodeBlock($from.parent) ? $from.before() : null;
};

export const canToggleCodeBlockCollapse = (state: EditorState) =>
  findCollapseTarget(state) !== null;

export const toggleCodeBlockCollapse = (view: EditorView) => {
  const target = findCollapseTarget(view.state);
  if (target === null) return false;
  const toggled = getCollapsedCodeBlocks(view.state).includes(target)
    ? expandCodeBlock(view, target)
    : collapseCodeBlock(view, target);
  if (toggled) view.focus();
  return toggled;
};

// The browser's caret motion skips hidden text, so an arrow press that would step onto a hidden
// line expands the block first and the press then lands on the revealed line. Under soft wrap the
// whole last shown line counts, since its rows are a layout matter.
const findBlockRevealedByKey = (state: EditorState, event: KeyboardEvent) => {
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key !== "ArrowDown" && event.key !== "ArrowRight") return null;
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const { $head } = selection;
  if (!isCodeBlock($head.parent)) return null;
  const block = $head.before();
  if (!getCollapsedCodeBlocks(state).includes(block)) return null;
  const hidden = getHiddenRange($head.parent, block);
  if (!hidden) return null;
  if (event.key === "ArrowRight") return $head.pos === hidden.from ? block : null;
  const lastLineStart = state.doc.textBetween(block + 1, hidden.from).lastIndexOf("\n") + block + 2;
  return $head.pos >= lastLineStart ? block : null;
};

const isSelectionMoving = (transactions: readonly Transaction[]) =>
  transactions.some((transaction) => transaction.docChanged || transaction.selectionSet);

export const createCodeBlockCollapsePlugin = () =>
  new Plugin<CodeBlockCollapseState>({
    key: codeBlockCollapsePluginKey,
    state: {
      init: (_, state) => createInitialState(state.doc),
      apply: applyCollapseTransaction,
    },
    appendTransaction: (transactions, _, state) => {
      if (!isSelectionMoving(transactions)) return null;
      const reached = selectionReachedBlocks(state, getCollapsedCodeBlocks(state));
      return reached.length > 0
        ? state.tr.setMeta(codeBlockCollapsePluginKey, {
            expand: reached,
          } satisfies CodeBlockCollapseMeta)
        : null;
    },
    props: {
      decorations: (state) => codeBlockCollapsePluginKey.getState(state)?.decorations,
      handleKeyDown: (view, event) => {
        const block = findBlockRevealedByKey(view.state, event);
        if (block !== null) expandCodeBlock(view, block);
        return false;
      },
    },
  });

export const createLeafdownCodeBlockCollapsePlugin = () => $prose(createCodeBlockCollapsePlugin);
