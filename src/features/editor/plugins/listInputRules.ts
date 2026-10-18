import { bulletListSchema, orderedListSchema } from "@milkdown/kit/preset/commonmark";
import { wrappingInputRule } from "@milkdown/kit/prose/inputrules";
import { $inputRule } from "@milkdown/kit/utils";

import {
  LIST_MARKER_ATTRIBUTE_NAME,
  readBulletListMarker,
  readOrderedListMarker,
} from "../utils/listMarkdown";

export const createLeafdownBulletListInputRule = () =>
  $inputRule((ctx) =>
    wrappingInputRule(
      /^\s*([-+*])\s$/u,
      bulletListSchema.type(ctx),
      (match) => ({ [LIST_MARKER_ATTRIBUTE_NAME]: match[1] }),
      (match, node) => readBulletListMarker(node.attrs) === match[1],
    ),
  );

export const createLeafdownOrderedListInputRule = () =>
  $inputRule((ctx) =>
    wrappingInputRule(
      /^\s*(\d+)([.)])\s$/u,
      orderedListSchema.type(ctx),
      (match) => ({ order: Number(match[1]), [LIST_MARKER_ATTRIBUTE_NAME]: match[2] }),
      (match, node) =>
        readOrderedListMarker(node.attrs) === match[2] &&
        node.childCount + node.attrs.order === Number(match[1]),
    ),
  );
