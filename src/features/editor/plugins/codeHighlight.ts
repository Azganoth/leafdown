import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { DecorationSet, type Decoration, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { handleUnexpectedError } from "@/lib/errors";

import {
  type DecorateCodeBlock,
  findCodeBlocks,
  removeDecorationsWithin,
  updateCodeBlockDecorations,
} from "../utils/codeBlockDecorations";
import type { LeafdownHighlightParser } from "../utils/highlighting";
import { findScrollingAncestor } from "../utils/scrollingAncestor";

interface CodeHighlightState {
  decorations: DecorationSet;
  /** Positions of the code blocks not highlighted yet, in document order. */
  pending: readonly number[];
}

interface HighlightedCodeBlock {
  position: number;
  end: number;
  decorations: Decoration[];
}

export const leafdownCodeHighlightPluginKey = new PluginKey<CodeHighlightState>(
  "leafdownCodeHighlight",
);

// Highlighting costs about linear time in the amount of code, so opening a document highlights only
// enough lines to fill a tall window and leaves the rest to later tasks.
const INITIAL_HIGHLIGHT_LINES = 100;

// The rest is highlighted in timer tasks rather than idle callbacks, which WebView2 can stop running
// for a window altogether. The block that crosses the end of a slice, the redraw, and the editor's
// own frame work all follow it, so a short slice keeps input from waiting on a long frame.
const SLICE_MS = 10;

const highlightCodeBlock = (
  parser: LeafdownHighlightParser,
  node: ProseMirrorNode,
  position: number,
): Decoration[] => {
  try {
    return parser({
      content: node.textContent,
      language: (node.attrs.language as string | undefined) || undefined,
      pos: position,
      size: node.nodeSize,
    });
  } catch (error) {
    handleUnexpectedError(error, "highlightCodeBlock");

    return [];
  }
};

const countLines = (node: ProseMirrorNode) => node.textContent.split("\n").length;

const createPluginState = (doc: ProseMirrorNode, decorate: DecorateCodeBlock) => {
  const decorations: Decoration[] = [];
  const pending: number[] = [];
  let lines = 0;

  for (const [position, node] of findCodeBlocks(doc)) {
    if (lines < INITIAL_HIGHLIGHT_LINES) {
      decorations.push(...decorate(node, position));
      lines += countLines(node);
    } else {
      pending.push(position);
    }
  }

  return { decorations: DecorationSet.create(doc, decorations), pending };
};

// A block an edit changed is highlighted by the edit but stays pending, and is highlighted again
// in its turn. Deleting a block, or changing it into another node, replaces its opening token;
// the block then leaves the pending list, since anything that edit put in its place it also
// highlighted.
const mapPending = (pending: readonly number[], transaction: Transaction) =>
  pending.flatMap((position) => {
    const mapped = transaction.mapping.mapResult(position, 1);

    return mapped.deleted ? [] : [mapped.pos];
  });

const applyHighlightedBlocks = (
  doc: ProseMirrorNode,
  pluginState: CodeHighlightState,
  blocks: readonly HighlightedCodeBlock[],
): CodeHighlightState => {
  let decorations = pluginState.decorations;

  for (const { position, end } of blocks) {
    decorations = removeDecorationsWithin(decorations, position, end);
  }

  const highlighted = new Set(blocks.map(({ position }) => position));

  return {
    decorations: decorations.add(
      doc,
      blocks.flatMap((block) => block.decorations),
    ),
    pending: pluginState.pending.filter((position) => !highlighted.has(position)),
  };
};

const findViewportPosition = (view: EditorView, scroller: Element | null) => {
  const bounds = view.dom.getBoundingClientRect();

  if (bounds.height === 0) {
    return null;
  }

  const top = Math.max(bounds.top, scroller?.getBoundingClientRect().top ?? 0);

  return view.posAtCoords({ left: bounds.left + bounds.width / 2, top: top + 1 })?.pos ?? null;
};

// The block reaching into the top of the viewport comes first, then the blocks below it, and
// the blocks above it last.
const orderPending = (pending: readonly number[], viewportPosition: number | null) => {
  if (viewportPosition === null) {
    return pending;
  }

  const below = pending.findIndex((position) => position > viewportPosition);
  const first = below === -1 ? pending.length - 1 : Math.max(below - 1, 0);

  return [...pending.slice(first), ...pending.slice(0, first)];
};

class PendingCodeHighlighter {
  private timeout: number | null = null;
  private scroller: Element | null | undefined;

  constructor(
    private readonly view: EditorView,
    private readonly decorate: DecorateCodeBlock,
  ) {
    this.schedule();
  }

  update() {
    this.schedule();
  }

  destroy() {
    if (this.timeout !== null) {
      this.view.dom.ownerDocument.defaultView?.clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  private schedule() {
    const window = this.view.dom.ownerDocument.defaultView;

    if (
      window &&
      this.timeout === null &&
      leafdownCodeHighlightPluginKey.getState(this.view.state)?.pending.length
    ) {
      this.timeout = window.setTimeout(this.highlightSlice);
    }
  }

  private readonly highlightSlice = () => {
    this.timeout = null;

    if (this.view.isDestroyed) {
      return;
    }

    const { state } = this.view;
    const pending = leafdownCodeHighlightPluginKey.getState(state)?.pending ?? [];
    const blocks: HighlightedCodeBlock[] = [];
    const sliceEnd = performance.now() + SLICE_MS;

    this.scroller ??= findScrollingAncestor(this.view.dom);

    for (const position of orderPending(pending, findViewportPosition(this.view, this.scroller))) {
      if (blocks.length > 0 && performance.now() >= sliceEnd) {
        break;
      }

      const node = state.doc.nodeAt(position)!;

      blocks.push({
        position,
        end: position + node.nodeSize,
        decorations: this.decorate(node, position),
      });
    }

    if (blocks.length > 0) {
      this.view.dispatch(createHighlightTransaction(state, blocks));
    }
  };
}

const createHighlightTransaction = (state: EditorState, blocks: HighlightedCodeBlock[]) =>
  state.tr.setMeta(leafdownCodeHighlightPluginKey, blocks).setMeta("addToHistory", false);

export const createCodeHighlightPlugin = (parser: LeafdownHighlightParser) => {
  const decorate = (node: ProseMirrorNode, position: number) =>
    highlightCodeBlock(parser, node, position);

  return new Plugin<CodeHighlightState>({
    key: leafdownCodeHighlightPluginKey,
    state: {
      init: (_config, state) => createPluginState(state.doc, decorate),
      apply: (transaction, pluginState) => {
        const highlighted = transaction.getMeta(leafdownCodeHighlightPluginKey) as
          | HighlightedCodeBlock[]
          | undefined;

        if (highlighted) {
          return applyHighlightedBlocks(transaction.doc, pluginState, highlighted);
        }

        if (!transaction.docChanged) {
          return pluginState;
        }

        return {
          decorations: updateCodeBlockDecorations(transaction, pluginState.decorations, decorate),
          pending: mapPending(pluginState.pending, transaction),
        };
      },
    },
    props: {
      decorations: (state) => leafdownCodeHighlightPluginKey.getState(state)?.decorations,
    },
    view: (view) => new PendingCodeHighlighter(view, decorate),
  });
};

export const createLeafdownCodeHighlightPlugin = (parser: LeafdownHighlightParser) =>
  $prose(() => createCodeHighlightPlugin(parser));
