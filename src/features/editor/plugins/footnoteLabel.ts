import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  findFootnoteLabelSpelling,
  FOOTNOTE_DEFINITION_MARKDOWN_TYPE,
  FOOTNOTE_REFERENCE_MARKDOWN_TYPE,
} from "../utils/footnoteLabelMarkdown";

const markAuthoredLabels = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (
      (child.type === FOOTNOTE_REFERENCE_MARKDOWN_TYPE ||
        child.type === FOOTNOTE_DEFINITION_MARKDOWN_TYPE) &&
      start !== undefined &&
      end !== undefined
    ) {
      const label = findFootnoteLabelSpelling(source.slice(start, end), child);

      if (label !== null) {
        (child as { label?: string }).label = label;
      }
    }

    markAuthoredLabels(child, source);
  }
};

export const createLeafdownFootnoteLabelPlugin = () =>
  $remark("leafdownFootnoteLabel", () => () => (tree, file) => {
    markAuthoredLabels(tree as MarkdownNode, String(file));
  });
