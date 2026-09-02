import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $remark } from "@milkdown/kit/utils";

import {
  DEFAULT_BULLET_LIST_MARKER,
  DEFAULT_ORDERED_LIST_MARKER,
  findListItemForm,
  LIST_ITEM_LEADING_BLANK_LINE_ATTRIBUTE_NAME,
  LIST_ITEM_MARKDOWN_TYPE,
  LIST_ITEM_NUMBER_ATTRIBUTE_NAME,
  LIST_ITEM_PADDING_ATTRIBUTE_NAME,
  LIST_MARKDOWN_TYPE,
  LIST_MARKER_ATTRIBUTE_NAME,
} from "../utils/listMarkdown";

// Nine digits, a delimiter, and four spaces are the longest head CommonMark reads as a marker and
// the padding after it.
const LIST_ITEM_HEAD_LENGTH = 14;

// An item's slice opens at its own marker rather than at the indentation the container gave it, so
// the head of that slice is the marker and what follows it on the same line.
const readListItemHead = (item: MarkdownNode, source: string) => {
  const start = item.position?.start.offset;
  const end = item.position?.end.offset;

  return start === undefined || end === undefined
    ? undefined
    : source.slice(start, Math.min(end, start + LIST_ITEM_HEAD_LENGTH));
};

// CommonMark puts an item's content one space past its marker wherever the marker's own line
// carries nothing else, so an item whose first block opens on a later line is one that was written
// with a blank line after its marker.
const opensOnLaterLine = (item: MarkdownNode) => {
  const marker = item.position?.start.line;
  const content = item.children?.[0]?.position?.start.line;

  return marker !== undefined && content !== undefined && content > marker;
};

// CommonMark reads a change of marker as the start of another list, so every item of one list was
// authored with the same one and the first item that carries a position answers for all of them.
const markAuthoredListForm = (list: MarkdownNode, source: string) => {
  const ordered = list.ordered === true;
  let listMarker: string | undefined;

  for (const item of list.children ?? []) {
    if (item.type !== LIST_ITEM_MARKDOWN_TYPE) {
      continue;
    }

    const head = readListItemHead(item, source);
    const form = head === undefined ? undefined : findListItemForm(head, ordered);

    if (!form) {
      continue;
    }

    listMarker ??= form.marker;

    const authored = item as Record<string, unknown>;

    authored[LIST_ITEM_PADDING_ATTRIBUTE_NAME] = form.padding;
    authored[LIST_ITEM_LEADING_BLANK_LINE_ATTRIBUTE_NAME] = opensOnLaterLine(item);

    if (form.number !== undefined) {
      authored[LIST_ITEM_NUMBER_ATTRIBUTE_NAME] = form.number;
    }
  }

  (list as Record<string, unknown>)[LIST_MARKER_ATTRIBUTE_NAME] =
    listMarker ?? (ordered ? DEFAULT_ORDERED_LIST_MARKER : DEFAULT_BULLET_LIST_MARKER);
};

const markAuthoredForm = (node: MarkdownNode, source: string) => {
  for (const child of node.children ?? []) {
    if (child.type === LIST_MARKDOWN_TYPE) {
      markAuthoredListForm(child, source);
    }

    markAuthoredForm(child, source);
  }
};

export const createLeafdownListFormPlugin = () =>
  $remark("leafdownListForm", () => () => (tree, file) => {
    markAuthoredForm(tree as MarkdownNode, String(file));
  });
