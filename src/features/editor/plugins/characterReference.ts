import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $markSchema, $remark } from "@milkdown/kit/utils";

import {
  CHARACTER_REFERENCE_MARK_NAME,
  characterReferenceMarkSchema,
  findAuthoredDestination,
  splitCharacterReferences,
} from "../utils/characterReferenceMarkdown";
import { findTitleMarker, type TitleMarker } from "../utils/markdownTitle";

export const leafdownCharacterReferenceSchema = $markSchema(
  CHARACTER_REFERENCE_MARK_NAME,
  () => characterReferenceMarkSchema,
);

// A reference is gone from the value by the time the tree exists, and a title keeps its text
// without its markers, so both are recovered by walking the tree against the slice of the file
// each node was built from. A node the parser gave no position, or one another transformer has
// already rebuilt, is left alone.
const markAuthoredSource = (node: MarkdownNode, source: string) => {
  const children = node.children;

  if (!children) {
    return;
  }

  const next: MarkdownNode[] = [];
  let split = false;

  for (const child of children) {
    const start = child.position?.start;
    const end = child.position?.end.offset;

    if (start?.offset !== undefined && end !== undefined) {
      if (child.type === "text" && typeof child.value === "string") {
        const parts = splitCharacterReferences(child.value, source.slice(start.offset, end), {
          column: start.column,
          line: start.line,
          offset: start.offset,
        });

        if (parts) {
          next.push(...parts);
          split = true;
          continue;
        }
      } else if (
        (child.type === "link" || child.type === "image") &&
        typeof child.url === "string"
      ) {
        const raw = source.slice(start.offset, end);
        const authored = findAuthoredDestination(raw, child.url);

        if (authored !== null) {
          (child as { authoredUrl?: string }).authoredUrl = authored;
        }

        if (child.title) {
          (child as { titleMarker?: TitleMarker }).titleMarker = findTitleMarker(raw);
        }
      }
    }

    markAuthoredSource(child, source);
    next.push(child);
  }

  if (split) {
    node.children = next;
  }
};

export const createLeafdownCharacterReferencePlugin = () =>
  $remark("leafdownCharacterReference", () => () => (tree, file) => {
    markAuthoredSource(tree as MarkdownNode, String(file));
  });
