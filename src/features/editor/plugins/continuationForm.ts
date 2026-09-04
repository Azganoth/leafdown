import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  findParagraphContinuations,
  PARAGRAPH_CONTINUATIONS_ATTRIBUTE_NAME,
  PARAGRAPH_MARKDOWN_TYPE,
} from "../utils/continuationMarkdown";

// The parse concatenates a paragraph's lines into its text with whatever each stood behind taken
// off, and records neither the prefixes nor where the lines fell, so the form survives only in the
// slice of the file the node was built from. A node the parser gave no position keeps the default.
const markAuthoredForm = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (child.type === PARAGRAPH_MARKDOWN_TYPE && start !== undefined && end !== undefined) {
      (child as Record<string, unknown>)[PARAGRAPH_CONTINUATIONS_ATTRIBUTE_NAME] =
        findParagraphContinuations(source.slice(start, end));
    }

    markAuthoredForm(child, source);
  }
};

export const createLeafdownContinuationFormPlugin = () =>
  $remark("leafdownContinuationForm", () => () => (tree, file) => {
    markAuthoredForm(tree as MarkdownNode, String(file));
  });
