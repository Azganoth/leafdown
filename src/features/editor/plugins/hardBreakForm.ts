import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  findHardBreakRun,
  HARD_BREAK_MARKDOWN_TYPE,
  HARD_BREAK_RUN_ATTRIBUTE_NAME,
} from "../utils/hardBreakMarkdown";

// A break carries no text of its own, so the characters it was written with survive only in the
// slice of the file it was built from. A node the parser gave no position keeps the default, which
// is every soft break: the preset splits those out of a text node once the tree is built.
const markAuthoredRuns = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (child.type === HARD_BREAK_MARKDOWN_TYPE && start !== undefined && end !== undefined) {
      (child as Record<string, unknown>)[HARD_BREAK_RUN_ATTRIBUTE_NAME] = findHardBreakRun(
        source.slice(start, end),
      );
    }

    markAuthoredRuns(child, source);
  }
};

export const createLeafdownHardBreakFormPlugin = () =>
  $remark("leafdownHardBreakForm", () => () => (tree, file) => {
    markAuthoredRuns(tree as MarkdownNode, String(file));
  });
