import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $markSchema, $remark } from "@milkdown/kit/utils";

import {
  CHARACTER_REFERENCE_MARK_NAME,
  characterReferenceMarkSchema,
  findAuthoredDescription,
  findAuthoredDestination,
  findAuthoredReferenceDescription,
  splitCharacterReferences,
} from "../utils/characterReferenceMarkdown";
import { findTitleMarker, type TitleMarker } from "../utils/markdownTitle";
import { IMAGE_REFERENCE_MARKDOWN_TYPE } from "../utils/referenceLinkMarkdown";

export const leafdownCharacterReferenceSchema = $markSchema(
  CHARACTER_REFERENCE_MARK_NAME,
  () => characterReferenceMarkSchema,
);

const readNodeString = (node: MarkdownNode, key: string) => {
  const value = (node as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
};

const markAuthoredDescription = (node: MarkdownNode, description: string | null) => {
  if (description !== null) {
    (node as { authoredDescription?: string }).authoredDescription = description;
  }
};

// A reference is gone from the value by the time the tree exists, a title keeps its text without
// its markers, and an image description keeps only the text its inline content spells, so all
// three are recovered by walking the tree against the slice of the file each node was built from.
// A node the parser gave no position, or one another transformer has already rebuilt, is left
// alone.
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

        if (child.type === "image") {
          markAuthoredDescription(
            child,
            findAuthoredDescription(raw, readNodeString(child, "alt") ?? "", child.url),
          );
        }

        if (child.title) {
          (child as { titleMarker?: TitleMarker }).titleMarker = findTitleMarker(raw);
        }
      } else if (child.type === IMAGE_REFERENCE_MARKDOWN_TYPE) {
        const label = readNodeString(child, "label");

        if (label !== null) {
          markAuthoredDescription(
            child,
            findAuthoredReferenceDescription(
              source.slice(start.offset, end),
              readNodeString(child, "alt") ?? "",
              label,
            ),
          );
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
