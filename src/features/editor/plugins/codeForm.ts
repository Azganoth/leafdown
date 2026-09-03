import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  CODE_FENCED_ATTRIBUTE_NAME,
  CODE_MARKDOWN_TYPE,
  findCodeFenced,
} from "../utils/codeMarkdown";

// The parse records the value and the info string, and the two forms of code block agree on both,
// so the form survives only in the slice of the file the node was built from. A node the parser
// gave no position keeps the default.
const markAuthoredForm = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (child.type === CODE_MARKDOWN_TYPE && start !== undefined && end !== undefined) {
      (child as Record<string, unknown>)[CODE_FENCED_ATTRIBUTE_NAME] = findCodeFenced(
        source.slice(start, end),
      );
    }

    markAuthoredForm(child, source);
  }
};

export const createLeafdownCodeFormPlugin = () =>
  $remark("leafdownCodeForm", () => () => (tree, file) => {
    markAuthoredForm(tree as MarkdownNode, String(file));
  });
