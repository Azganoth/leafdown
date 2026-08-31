import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  findThematicBreakMarker,
  THEMATIC_BREAK_MARKDOWN_TYPE,
  THEMATIC_BREAK_MARKER_ATTRIBUTE_NAME,
} from "../utils/thematicBreakMarkdown";

// A break carries no text of its own, so the characters it was written with survive only in the
// slice of the file it was built from. A node the parser gave no position keeps the default.
const markAuthoredMarkers = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (child.type === THEMATIC_BREAK_MARKDOWN_TYPE && start !== undefined && end !== undefined) {
      (child as Record<string, unknown>)[THEMATIC_BREAK_MARKER_ATTRIBUTE_NAME] =
        findThematicBreakMarker(source.slice(start, end));
    }

    markAuthoredMarkers(child, source);
  }
};

export const createLeafdownThematicBreakPlugin = () =>
  $remark("leafdownThematicBreak", () => () => (tree, file) => {
    markAuthoredMarkers(tree as MarkdownNode, String(file));
  });
