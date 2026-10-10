import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { AttrStep } from "@milkdown/kit/prose/transform";
import type { Decoration } from "@milkdown/kit/prose/view";
import { DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { handleUnexpectedError } from "@/lib/errors";

import type { LeafdownHighlightParser } from "../utils/highlighting";

type ChangedRange = [from: number, to: number];

export const leafdownCodeHighlightPluginKey = new PluginKey<DecorationSet>("leafdownCodeHighlight");

const isCodeBlock = (node: ProseMirrorNode) => node.type.name === "code_block";

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

const collectCodeBlocks = (
  node: ProseMirrorNode,
  contentStart: number,
  blocks: Map<number, ProseMirrorNode>,
) => {
  node.descendants((child, offset) => {
    if (isCodeBlock(child)) {
      blocks.set(contentStart + offset, child);
    }

    return !child.isTextblock;
  });
};

const createHighlightDecorations = (parser: LeafdownHighlightParser, doc: ProseMirrorNode) => {
  const blocks = new Map<number, ProseMirrorNode>();

  collectCodeBlocks(doc, 0, blocks);

  return DecorationSet.create(
    doc,
    [...blocks].flatMap(([position, node]) => highlightCodeBlock(parser, node, position)),
  );
};

// Ranges are in the transaction's final document. An attribute step maps no positions, so the
// node it changes is added as a range of its own.
const collectChangedRanges = (transaction: Transaction) => {
  let ranges: ChangedRange[] = [];

  transaction.mapping.maps.forEach((map, index) => {
    ranges = ranges.map(([from, to]) => [map.map(from, -1), map.map(to, 1)]);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push([newStart, newEnd]);
    });

    const step = transaction.steps[index];

    if (step instanceof AttrStep) {
      ranges.push([step.pos, step.pos + 1]);
    }
  });

  return ranges;
};

// A node whose own opening or closing token changed may now hold blocks that were elsewhere, such
// as blocks wrapped in a new quote. A block decoration fails validation under its new parent and
// is dropped while mapping, so every code block inside such a node is highlighted again.
const collectTouchedTextblocks = (doc: ProseMirrorNode, ranges: ChangedRange[]) => {
  const blocks = new Map<number, ProseMirrorNode>();

  for (const [from, to] of ranges) {
    doc.nodesBetween(from, to, (node, position) => {
      if (node.isTextblock) {
        blocks.set(position, node);

        return false;
      }

      const end = position + node.nodeSize;

      if ((position >= from && position < to) || (end > from && end <= to)) {
        collectCodeBlocks(node, position + 1, blocks);

        return false;
      }

      return true;
    });
  }

  return blocks;
};

const applyHighlightDecorations = (
  parser: LeafdownHighlightParser,
  transaction: Transaction,
  decorations: DecorationSet,
) => {
  if (!transaction.docChanged) {
    return decorations;
  }

  const { doc } = transaction;
  let next = decorations.map(transaction.mapping, doc);
  const added: Decoration[] = [];

  // Every touched textblock sheds what mapping carried into it, so a code block turned into a
  // paragraph keeps none of its highlighting.
  for (const [position, node] of collectTouchedTextblocks(doc, collectChangedRanges(transaction))) {
    const end = position + node.nodeSize;
    const stale = next.find(position, end);

    next = next.remove(
      stale.filter((decoration) => decoration.from >= position && decoration.to <= end),
    );

    if (isCodeBlock(node)) {
      added.push(...highlightCodeBlock(parser, node, position));
    }
  }

  return next.add(doc, added);
};

export const createCodeHighlightPlugin = (parser: LeafdownHighlightParser) =>
  new Plugin<DecorationSet>({
    key: leafdownCodeHighlightPluginKey,
    state: {
      init: (_config, state) => createHighlightDecorations(parser, state.doc),
      apply: (transaction, decorations) =>
        applyHighlightDecorations(parser, transaction, decorations),
    },
    props: {
      decorations: (state) => leafdownCodeHighlightPluginKey.getState(state),
    },
  });

export const createLeafdownCodeHighlightPlugin = (parser: LeafdownHighlightParser) =>
  $prose(() => createCodeHighlightPlugin(parser));
