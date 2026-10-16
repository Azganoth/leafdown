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
  collapse?: readonly number[];
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

const hidingBlockAt = (doc: ProseMirrorNode, blocks: readonly number[], position: number) => {
  const $position = doc.resolve(position);
  if (!isCodeBlock($position.parent)) return null;
  const block = $position.before();
  if (!blocks.includes(block)) return null;
  const hidden = getHiddenRange($position.parent, block);
  return hidden && isInsideHiddenRange(hidden, position) ? { block, hidden } : null;
};

const hiddenRangeAt = (doc: ProseMirrorNode, collapsed: readonly number[], position: number) =>
  hidingBlockAt(doc, collapsed, position)?.block ?? null;

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

  if (meta?.collapse) collapsed.push(...meta.collapse);
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

const selectionLeavingBlocks = (state: EditorState, blocks: readonly number[]) => {
  const { from, to } = state.selection;
  const hiding = hidingBlockAt(state.doc, blocks, from) ?? hidingBlockAt(state.doc, blocks, to);
  return hiding ? TextSelection.create(state.doc, hiding.hidden.from) : null;
};

// A collapse that would hide the caret or either end of the selection moves the caret to the end
// of the last line that block still shows.
const collapseCodeBlocks = (view: EditorView, blocks: readonly number[], scroll: boolean) => {
  const { state } = view;
  const transaction = state.tr.setMeta(codeBlockCollapsePluginKey, {
    collapse: blocks,
  } satisfies CodeBlockCollapseMeta);
  const selection = selectionLeavingBlocks(state, blocks);
  if (selection) {
    transaction.setSelection(selection);
    if (scroll) transaction.scrollIntoView();
  }
  view.dispatch(transaction);
};

export const collapseCodeBlock = (view: EditorView, position: number) => {
  const { state } = view;
  const node = state.doc.nodeAt(position);
  if (!node || !isCollapsibleCodeBlock(node) || getCollapsedCodeBlocks(state).includes(position)) {
    return false;
  }
  collapseCodeBlocks(view, [position], true);
  return true;
};

// Every long block carries a node decoration naming its state, so the set lists them without
// walking the document.
const findCollapsibleCodeBlocks = (state: EditorState) =>
  (
    codeBlockCollapsePluginKey
      .getState(state)
      ?.decorations.find(
        undefined,
        undefined,
        (spec: { leafdownCodeCollapse?: CodeBlockCollapse }) => !!spec.leafdownCodeCollapse,
      ) ?? []
  ).map((decoration) => decoration.from);

export interface CodeBlockCollapseSummary {
  collapsible: boolean;
  expanded: boolean;
}

export const readCodeBlockCollapseSummary = (state: EditorState): CodeBlockCollapseSummary => {
  const collapsed = getCollapsedCodeBlocks(state);
  return {
    collapsible: collapsed.length > 0 || findCollapsibleCodeBlocks(state).length > 0,
    expanded: collapsed.length === 0,
  };
};

export const expandAllCodeBlocks = (view: EditorView) => {
  const collapsed = getCollapsedCodeBlocks(view.state);
  if (collapsed.length === 0) return false;
  view.dispatch(
    view.state.tr.setMeta(codeBlockCollapsePluginKey, {
      expand: collapsed,
    } satisfies CodeBlockCollapseMeta),
  );
  return true;
};

// The caret a collapse moves stays where it lands rather than scrolling into view, since the
// press came from a block that may be far from it.
export const collapseAllCodeBlocks = (view: EditorView) => {
  const collapsed = new Set(getCollapsedCodeBlocks(view.state));
  const blocks = findCollapsibleCodeBlocks(view.state).filter(
    (position) => !collapsed.has(position),
  );
  if (blocks.length === 0) return false;
  collapseCodeBlocks(view, blocks, false);
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

// After the browser moves the caret onto the start of a wrapped row, the editor's selection can
// still hold the row above when the next key arrives, so the browser's own caret is read first.
const readBrowserCaret = (view: EditorView) => {
  const selection = view.dom.ownerDocument.getSelection();
  if (!view.hasFocus() || !selection?.isCollapsed) return null;
  const { focusNode, focusOffset } = selection;
  return focusNode && view.dom.contains(focusNode) ? view.posAtDOM(focusNode, focusOffset) : null;
};

interface KeyReveal {
  block: number;
  target: number;
}

// The browser's caret motion skips hidden text, and after a block expands mid-press it does not
// reliably step onto the revealed line, so an arrow press that would leave the last shown line
// expands the block and places the caret on the next line itself, keeping its column for `Down`.
const findKeyReveal = (view: EditorView, event: KeyboardEvent): KeyReveal | null => {
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key !== "ArrowDown" && event.key !== "ArrowRight") return null;
  const { state } = view;
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const $head = state.doc.resolve(readBrowserCaret(view) ?? selection.head);
  if (!isCodeBlock($head.parent)) return null;
  const block = $head.before();
  if (!getCollapsedCodeBlocks(state).includes(block)) return null;
  const hidden = getHiddenRange($head.parent, block);
  if (!hidden) return null;
  const nextLineStart = hidden.from + 1;
  if (event.key === "ArrowRight") {
    return $head.pos === hidden.from ? { block, target: nextLineStart } : null;
  }

  const lastLineStart = state.doc.textBetween(block + 1, hidden.from).lastIndexOf("\n") + block + 2;
  if ($head.pos < lastLineStart || !isOnLastShownRow(view, $head.pos, hidden.from)) return null;
  const nextLineEnd = state.doc.textBetween(nextLineStart, hidden.to).indexOf("\n");
  const nextLineLength = nextLineEnd === -1 ? hidden.to - nextLineStart : nextLineEnd;
  return {
    block,
    target: nextLineStart + Math.min($head.pos - lastLineStart, nextLineLength),
  };
};

// Under soft wrap the last shown line may span rows, and only its last row leaves it downward. The
// line's end sits against hidden text, so it is measured from its own side.
const isOnLastShownRow = (view: EditorView, head: number, lineEnd: number) =>
  Math.abs(
    view.coordsAtPos(head, head === lineEnd ? -1 : 1).bottom - view.coordsAtPos(lineEnd, -1).bottom,
  ) < 1;

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
        const reveal = findKeyReveal(view, event);
        if (!reveal) return false;
        view.dispatch(
          view.state.tr
            .setMeta(codeBlockCollapsePluginKey, {
              expand: [reveal.block],
            } satisfies CodeBlockCollapseMeta)
            .setSelection(TextSelection.create(view.state.doc, reveal.target))
            .scrollIntoView(),
        );
        return true;
      },
    },
  });

export const createLeafdownCodeBlockCollapsePlugin = () => $prose(createCodeBlockCollapsePlugin);
