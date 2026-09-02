import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  findHeadingForm,
  HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME,
  HEADING_MARKDOWN_TYPE,
  HEADING_SEPARATOR_ATTRIBUTE_NAME,
  HEADING_UNDERLINE_ATTRIBUTE_NAME,
} from "../utils/headingMarkdown";

// The parse records the level, and the level is all an ATX and a setext heading have in common, so
// the form survives only in the slice of the file the node was built from. A node the parser gave
// no position keeps the defaults.
const markAuthoredForm = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (child.type === HEADING_MARKDOWN_TYPE && start !== undefined && end !== undefined) {
      const form = findHeadingForm(source.slice(start, end));
      const authored = child as Record<string, unknown>;

      authored[HEADING_SEPARATOR_ATTRIBUTE_NAME] = form.separator;
      authored[HEADING_CLOSING_SEQUENCE_ATTRIBUTE_NAME] = form.closingSequence;
      authored[HEADING_UNDERLINE_ATTRIBUTE_NAME] = form.underline;
    }

    markAuthoredForm(child, source);
  }
};

export const createLeafdownHeadingFormPlugin = () =>
  $remark("leafdownHeadingForm", () => () => (tree, file) => {
    markAuthoredForm(tree as MarkdownNode, String(file));
  });
