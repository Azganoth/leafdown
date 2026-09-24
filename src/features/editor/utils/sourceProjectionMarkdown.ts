import type { MarkdownNode } from "@milkdown/kit/transformer";

export const getMarkdownSourcePosition = (node: MarkdownNode) => {
  const position = node.position as
    | { end?: { offset?: number }; start?: { offset?: number } }
    | undefined;
  const from = position?.start?.offset;
  const to = position?.end?.offset;

  return typeof from === "number" && typeof to === "number" ? { from, to } : null;
};
