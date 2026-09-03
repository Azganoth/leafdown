import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import { BLOCK_ADJACENT_ATTRIBUTE_NAME } from "../utils/blockSeparatorMarkdown";

// mdast block containers whose ProseMirror counterparts hold block content.
const BLOCK_CONTAINER_TYPES = new Set(["root", "blockquote", "listItem", "footnoteDefinition"]);

const createEmptyParagraph = (): MarkdownNode => ({ type: "paragraph", children: [] });

// One blank line separates two blocks, and the serializer writes each empty paragraph as a
// further pair, so the surplus lines divided by two are the paragraphs to restore.
const countEmptyParagraphsBetween = (previous: MarkdownNode, next: MarkdownNode) => {
  const previousLine = previous.position?.end.line;
  const nextLine = next.position?.start.line;

  if (previousLine === undefined || nextLine === undefined) {
    return 0;
  }

  return Math.max(0, Math.floor((nextLine - previousLine - 2) / 2));
};

// The blank line the serializer puts between two blocks is the separator every pair reads back
// from, so the form a file holds is the pair written without one. It survives only in the lines
// the two nodes were built from: a block opening on the line the one before it closes on is the
// pair the author wrote adjacent. A node the parser gave no position keeps the default.
const isAdjacentTo = (previous: MarkdownNode, next: MarkdownNode) => {
  const previousLine = previous.position?.end.line;
  const nextLine = next.position?.start.line;

  return previousLine !== undefined && nextLine !== undefined && previousLine + 1 === nextLine;
};

// The preset wraps block-position raw HTML for root, blockquote, and list items only. Left
// unwrapped in a footnote definition, an inline node in block position takes the whole
// definition out of the document.
const needsParagraphWrapper = (parent: MarkdownNode, child: MarkdownNode) =>
  parent.type === "footnoteDefinition" && child.type === "html";

/// Restores the blank paragraphs a blank-line run represents, records the pairs written with no
/// blank line between them, and puts block-position raw HTML somewhere the schema accepts. Runs
/// before the preset's own mdast transformers. Exported for colocated tests.
export const restoreBlockStructure = (tree: MarkdownNode) => {
  const children = tree.children;

  if (!children?.length) {
    return;
  }

  if (BLOCK_CONTAINER_TYPES.has(tree.type)) {
    const restored: MarkdownNode[] = [];

    children.forEach((child, index) => {
      const previous = children[index - 1];
      // The separator belongs to the block that stands in the file, which is the wrapper where one
      // is filled in. The preset's own raw HTML wrapper rewrites the node in place and carries it.
      const block = needsParagraphWrapper(tree, child)
        ? ({ type: "paragraph", children: [child] } as MarkdownNode)
        : child;

      if (previous) {
        for (let count = countEmptyParagraphsBetween(previous, child); count > 0; count -= 1) {
          restored.push(createEmptyParagraph());
        }

        if (isAdjacentTo(previous, child)) {
          (block as Record<string, unknown>)[BLOCK_ADJACENT_ATTRIBUTE_NAME] = true;
        }
      }

      restored.push(block);
    });

    tree.children = restored;
  }

  tree.children?.forEach(restoreBlockStructure);
};

export const createLeafdownBlockStructurePlugin = () =>
  $remark("leafdownBlockStructure", () => () => (tree) => {
    restoreBlockStructure(tree as MarkdownNode);
  });
