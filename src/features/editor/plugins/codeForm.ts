import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  CODE_CLOSED_ATTRIBUTE_NAME,
  CODE_FENCE_ATTRIBUTE_NAME,
  CODE_FENCE_SURPLUS_ATTRIBUTE_NAME,
  CODE_FENCED_ATTRIBUTE_NAME,
  CODE_INDENT_ATTRIBUTE_NAME,
  CODE_MARKDOWN_TYPE,
  CODE_SEPARATOR_ATTRIBUTE_NAME,
  findCodeForm,
} from "../utils/codeMarkdown";

// The parse records the value and the info string, and neither the two forms of code block nor the
// fences that spell one differ in either, so the form survives only in the slice of the file the
// node was built from. A node the parser gave no position keeps the defaults.
const markAuthoredForm = (node: MarkdownNode, source: string, atRoot: boolean) => {
  const children = node.children ?? [];

  for (const child of children) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;
    const column = child.position?.start.column;

    if (
      child.type === CODE_MARKDOWN_TYPE &&
      start !== undefined &&
      end !== undefined &&
      column !== undefined
    ) {
      const form = findCodeForm({
        raw: source.slice(start, end),
        value: (child.value as string | undefined) ?? "",
        column,
        atRoot,
        endsDocument: atRoot && child === children[children.length - 1],
      });
      const authored = child as Record<string, unknown>;

      authored[CODE_FENCED_ATTRIBUTE_NAME] = form.fenced;
      authored[CODE_FENCE_ATTRIBUTE_NAME] = form.fence;
      authored[CODE_FENCE_SURPLUS_ATTRIBUTE_NAME] = form.fenceSurplus;
      authored[CODE_SEPARATOR_ATTRIBUTE_NAME] = form.separator;
      authored[CODE_INDENT_ATTRIBUTE_NAME] = form.indent;
      authored[CODE_CLOSED_ATTRIBUTE_NAME] = form.closed;
    }

    markAuthoredForm(child, source, false);
  }
};

export const createLeafdownCodeFormPlugin = () =>
  $remark("leafdownCodeForm", () => () => (tree, file) => {
    markAuthoredForm(tree as MarkdownNode, String(file), true);
  });
