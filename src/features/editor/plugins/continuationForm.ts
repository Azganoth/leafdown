import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  CONTINUATIONS_ATTRIBUTE_NAME,
  findContinuations,
  HEADING_MARKDOWN_TYPE,
  PARAGRAPH_MARKDOWN_TYPE,
} from "../utils/continuationMarkdown";

// The blocks whose text stands on lines of its own. A setext heading's underline is one of them:
// the run it spells belongs to the heading's own form, but the whitespace before that run is the
// line's, and the two are independent. An ATX heading holds a line break as a character reference
// and never spans lines, so its slice yields no record at all.
const RECORDED_MARKDOWN_TYPES = new Set([PARAGRAPH_MARKDOWN_TYPE, HEADING_MARKDOWN_TYPE]);

// The parse concatenates a block's lines into its text with whatever each stood behind taken off,
// and records neither the prefixes nor where the lines fell, so the form survives only in the slice
// of the file the node was built from. A node the parser gave no position keeps the default.
const markAuthoredForm = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (RECORDED_MARKDOWN_TYPES.has(child.type) && start !== undefined && end !== undefined) {
      (child as Record<string, unknown>)[CONTINUATIONS_ATTRIBUTE_NAME] = findContinuations(
        source.slice(start, end),
      );
    }

    markAuthoredForm(child, source);
  }
};

export const createLeafdownContinuationFormPlugin = () =>
  $remark("leafdownContinuationForm", () => () => (tree, file) => {
    markAuthoredForm(tree as MarkdownNode, String(file));
  });
