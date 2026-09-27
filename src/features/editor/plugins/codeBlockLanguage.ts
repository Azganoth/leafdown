import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { readCodeMeta } from "../utils/codeMarkdown";
import { BlockSelection, getSelectedBlockTargets } from "./blockSelection";

interface CodeBlockLanguageState {
  position: number | null;
}

type CodeBlockLanguageMeta = { type: "open"; position: number } | { type: "close" };

export interface CodeBlockLanguageRequest {
  /** The block's language badge, which the picker opens against. */
  anchor: Element;
  /** The document the request was opened on; an edit to it retires the request. */
  document: ProseMirrorNode;
  language: string;
  meta: string;
  position: number;
}

export interface LeafdownCodeBlockLanguagePluginOptions {
  onClose?: () => void;
  onRequest?: (request: CodeBlockLanguageRequest) => void;
}

export const CODE_BLOCK_NODE_NAME = "code_block";
export const CODE_LANGUAGE_BADGE_SELECTOR = "[data-leafdown-code-language]";
const ACTIVE_CODE_BLOCK_CLASS = "leafdown-code-block--active";

export const leafdownCodeBlockLanguagePluginKey = new PluginKey<CodeBlockLanguageState>(
  "leafdownCodeBlockLanguage",
);

const CLOSED_STATE: CodeBlockLanguageState = { position: null };

export const setCodeBlockLanguageRequestMeta = (tr: Transaction, meta: CodeBlockLanguageMeta) =>
  tr.setMeta(leafdownCodeBlockLanguagePluginKey, meta);

export const getCodeBlockLanguageRequestPosition = (state: EditorState) =>
  leafdownCodeBlockLanguagePluginKey.getState(state)?.position ?? null;

/** The one code block the selection lies within or selects, whatever its form. */
export const findSelectedCodeBlockPosition = (state: EditorState): number | null => {
  const { selection } = state;

  if (selection instanceof BlockSelection) {
    const targets = getSelectedBlockTargets(selection);
    const [target] = targets;

    return targets.length === 1 && target.node.type.name === CODE_BLOCK_NODE_NAME
      ? target.pos
      : null;
  }

  if (selection instanceof NodeSelection) {
    return selection.node.type.name === CODE_BLOCK_NODE_NAME ? selection.from : null;
  }

  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === CODE_BLOCK_NODE_NAME) {
      return selection.to <= $from.end(depth) ? $from.before(depth) : null;
    }
  }

  return null;
};

// A block without a language shows its badge only while it is the one being worked in, which the
// pointer half of is plain CSS and the caret half is this.
const createActiveBlockDecorations = (state: EditorState) => {
  const positions = new Set(
    [findSelectedCodeBlockPosition(state), getCodeBlockLanguageRequestPosition(state)].filter(
      (position) => position !== null,
    ),
  );
  const decorations = [...positions].flatMap((position) => {
    const node = state.doc.nodeAt(position);

    return node?.type.name === CODE_BLOCK_NODE_NAME
      ? [Decoration.node(position, position + node.nodeSize, { class: ACTIVE_CODE_BLOCK_CLASS })]
      : [];
  });

  return decorations.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(state.doc, decorations);
};

export const createLeafdownCodeBlockLanguagePlugin = (
  options: LeafdownCodeBlockLanguagePluginOptions = {},
) =>
  $prose(
    () =>
      new Plugin<CodeBlockLanguageState>({
        key: leafdownCodeBlockLanguagePluginKey,
        state: {
          init: () => CLOSED_STATE,
          apply: (tr, value) => {
            const meta = tr.getMeta(leafdownCodeBlockLanguagePluginKey) as
              | CodeBlockLanguageMeta
              | undefined;

            if (meta?.type === "open") {
              return { position: meta.position };
            }

            if (meta?.type === "close") {
              return CLOSED_STATE;
            }

            // Positions are not mapped: a staged language belongs to the block as it stood when the
            // picker opened, and any edit may have moved, split, or replaced that block.
            return tr.docChanged && value.position !== null ? CLOSED_STATE : value;
          },
        },
        props: {
          decorations: createActiveBlockDecorations,
        },
        view: (editorView) => ({
          update: (view, previousState) => {
            const previous = leafdownCodeBlockLanguagePluginKey.getState(previousState);
            const next = leafdownCodeBlockLanguagePluginKey.getState(view.state);

            if (next === previous) {
              return;
            }

            const node = next?.position == null ? null : view.state.doc.nodeAt(next.position);
            const block = next?.position == null ? null : view.nodeDOM(next.position);
            const anchor =
              block instanceof Element ? block.querySelector(CODE_LANGUAGE_BADGE_SELECTOR) : null;

            if (next?.position == null || !node || !anchor) {
              if (previous?.position != null) {
                options.onClose?.();
              }

              return;
            }

            options.onRequest?.({
              anchor,
              document: view.state.doc,
              language: node.attrs.language as string,
              meta: readCodeMeta(node.attrs),
              position: next.position,
            });
          },
          destroy: () => {
            if (leafdownCodeBlockLanguagePluginKey.getState(editorView.state)?.position != null) {
              options.onClose?.();
            }
          },
        }),
      }),
  );
