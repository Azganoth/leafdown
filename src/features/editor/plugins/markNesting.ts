import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

const FLATTENED_MARK_TYPES = new Set(["delete", "emphasis", "strong"]);

const flattenRedundantMarks = (node: MarkdownNode, openTypes: Set<string>): void => {
  if (!node.children) {
    return;
  }

  node.children = node.children.flatMap((child) => {
    if (FLATTENED_MARK_TYPES.has(child.type)) {
      if (openTypes.has(child.type)) {
        flattenRedundantMarks(child, openTypes);

        return child.children ?? [];
      }

      openTypes.add(child.type);
      flattenRedundantMarks(child, openTypes);
      openTypes.delete(child.type);

      return [child];
    }

    flattenRedundantMarks(child, openTypes);

    return [child];
  });
};

export const createLeafdownMarkNestingPlugin = () =>
  $remark("leafdownMarkNesting", () => () => (tree) => {
    flattenRedundantMarks(tree as MarkdownNode, new Set());
  });
