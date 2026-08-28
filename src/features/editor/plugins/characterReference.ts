import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $markSchema, $remark } from "@milkdown/kit/utils";

import {
  CHARACTER_REFERENCE_MARK_NAME,
  characterReferenceMarkSchema,
  splitCharacterReferences,
} from "../utils/characterReferenceMarkdown";

export const leafdownCharacterReferenceSchema = $markSchema(
  CHARACTER_REFERENCE_MARK_NAME,
  () => characterReferenceMarkSchema,
);

// A reference is gone from the value by the time the tree exists, so the run it covered is
// recovered by walking the value against the slice of the file it was built from. A node the
// parser gave no position, or one another transformer has already rebuilt, is left alone.
const markCharacterReferences = (node: MarkdownNode, source: string) => {
  const children = node.children;

  if (!children) {
    return;
  }

  const next: MarkdownNode[] = [];
  let split = false;

  for (const child of children) {
    const start = child.position?.start.offset;
    const end = child.position?.end.offset;

    if (
      child.type === "text" &&
      typeof child.value === "string" &&
      start !== undefined &&
      end !== undefined
    ) {
      const parts = splitCharacterReferences(child.value, source.slice(start, end));

      if (parts) {
        next.push(...parts);
        split = true;
        continue;
      }
    }

    markCharacterReferences(child, source);
    next.push(child);
  }

  if (split) {
    node.children = next;
  }
};

export const createLeafdownCharacterReferencePlugin = () =>
  $remark("leafdownCharacterReference", () => () => (tree, file) => {
    markCharacterReferences(tree as MarkdownNode, String(file));
  });
