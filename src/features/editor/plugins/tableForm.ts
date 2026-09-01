import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  findTableOuterPipes,
  TABLE_MARKDOWN_TYPE,
  TABLE_OUTER_PIPES_ATTRIBUTE_NAME,
} from "../utils/tableMarkdown";

const TRAILING_WHITESPACE_PATTERN = /[\t ]+$/u;

// A row's slice already has its container prefix and its indentation taken off, so the outer pipes
// are the first and last characters of it once the whitespace closing the line is trimmed. The
// delimiter row is no node of its own, which is why the form is read off the rows that are.
const readRowSource = (row: MarkdownNode, source: string) => {
  const start = row.position?.start.offset;
  const end = row.position?.end.offset;

  return start === undefined || end === undefined
    ? undefined
    : source.slice(start, end).replace(TRAILING_WHITESPACE_PATTERN, "");
};

const markAuthoredOuterPipes = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    if (child.type === TABLE_MARKDOWN_TYPE) {
      const rows = (child.children ?? [])
        .map((row) => readRowSource(row, source))
        .filter((row) => row !== undefined);

      (child as Record<string, unknown>)[TABLE_OUTER_PIPES_ATTRIBUTE_NAME] =
        findTableOuterPipes(rows);
    }

    markAuthoredOuterPipes(child, source);
  }
};

export const createLeafdownTableFormPlugin = () =>
  $remark("leafdownTableForm", () => () => (tree, file) => {
    markAuthoredOuterPipes(tree as MarkdownNode, String(file));
  });
