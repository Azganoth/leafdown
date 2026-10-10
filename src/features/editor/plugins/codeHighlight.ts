import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { handleUnexpectedError } from "@/lib/errors";

import {
  createCodeBlockDecorations,
  updateCodeBlockDecorations,
} from "../utils/codeBlockDecorations";
import type { LeafdownHighlightParser } from "../utils/highlighting";

export const leafdownCodeHighlightPluginKey = new PluginKey<DecorationSet>("leafdownCodeHighlight");

const highlightCodeBlock = (
  parser: LeafdownHighlightParser,
  node: ProseMirrorNode,
  position: number,
): Decoration[] => {
  try {
    return parser({
      content: node.textContent,
      language: (node.attrs.language as string | undefined) || undefined,
      pos: position,
      size: node.nodeSize,
    });
  } catch (error) {
    handleUnexpectedError(error, "highlightCodeBlock");

    return [];
  }
};

export const createCodeHighlightPlugin = (parser: LeafdownHighlightParser) => {
  const decorate = (node: ProseMirrorNode, position: number) =>
    highlightCodeBlock(parser, node, position);

  return new Plugin<DecorationSet>({
    key: leafdownCodeHighlightPluginKey,
    state: {
      init: (_config, state) => createCodeBlockDecorations(state.doc, decorate),
      apply: (transaction, decorations) =>
        updateCodeBlockDecorations(transaction, decorations, decorate),
    },
    props: {
      decorations: (state) => leafdownCodeHighlightPluginKey.getState(state),
    },
  });
};

export const createLeafdownCodeHighlightPlugin = (parser: LeafdownHighlightParser) =>
  $prose(() => createCodeHighlightPlugin(parser));
