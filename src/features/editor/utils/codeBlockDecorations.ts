import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { Transaction } from "@milkdown/kit/prose/state";
import type { Decoration } from "@milkdown/kit/prose/view";
import { DecorationSet } from "@milkdown/kit/prose/view";

import { collectChangedRanges, type ChangedRange } from "./changedRanges";

export type DecorateCodeBlock = (node: ProseMirrorNode, position: number) => Decoration[];

const isCodeBlock = (node: ProseMirrorNode) => node.type.name === "code_block";

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

export const findCodeBlocks = (doc: ProseMirrorNode) => {
  const blocks = new Map<number, ProseMirrorNode>();

  collectCodeBlocks(doc, 0, blocks);

  return blocks;
};

export const createCodeBlockDecorations = (doc: ProseMirrorNode, decorate: DecorateCodeBlock) =>
  DecorationSet.create(
    doc,
    [...findCodeBlocks(doc)].flatMap(([position, node]) => decorate(node, position)),
  );

export const removeDecorationsWithin = (decorations: DecorationSet, from: number, to: number) =>
  decorations.remove(
    decorations
      .find(from, to)
      .filter((decoration) => decoration.from >= from && decoration.to <= to),
  );

// A node whose own opening or closing token changed may now hold blocks that were elsewhere, such
// as blocks wrapped in a new quote. A block decoration fails validation under its new parent and
// is dropped while mapping, so every code block inside such a node is decorated again.
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

export const updateCodeBlockDecorations = (
  transaction: Transaction,
  decorations: DecorationSet,
  decorate: DecorateCodeBlock,
) => {
  if (!transaction.docChanged) {
    return decorations;
  }

  const { doc } = transaction;
  let next = decorations.map(transaction.mapping, doc);
  const added: Decoration[] = [];

  // Every touched textblock sheds what mapping carried into it, so a code block turned into a
  // paragraph keeps none of its decorations.
  for (const [position, node] of collectTouchedTextblocks(doc, collectChangedRanges(transaction))) {
    next = removeDecorationsWithin(next, position, position + node.nodeSize);

    if (isCodeBlock(node)) {
      added.push(...decorate(node, position));
    }
  }

  return next.add(doc, added);
};
