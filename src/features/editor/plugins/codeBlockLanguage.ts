import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

import { readCodeMeta } from "../utils/codeMarkdown";
import { createContextPopupAnchor, type ContextPopupAnchor } from "../utils/contextPopupAnchor";

interface CodeBlockLanguageState {
  position: number | null;
}

type CodeBlockLanguageMeta = { type: "open"; position: number } | { type: "close" };

export interface CodeBlockLanguageRequest {
  anchor: ContextPopupAnchor;
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

export const leafdownCodeBlockLanguagePluginKey = new PluginKey<CodeBlockLanguageState>(
  "leafdownCodeBlockLanguage",
);

const CLOSED_STATE: CodeBlockLanguageState = { position: null };

export const setCodeBlockLanguageRequestMeta = (tr: Transaction, meta: CodeBlockLanguageMeta) =>
  tr.setMeta(leafdownCodeBlockLanguagePluginKey, meta);

export const getCodeBlockLanguageRequestPosition = (state: EditorState) =>
  leafdownCodeBlockLanguagePluginKey.getState(state)?.position ?? null;

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
            // popover opened, and any edit may have moved, split, or replaced that block.
            return tr.docChanged && value.position !== null ? CLOSED_STATE : value;
          },
        },
        view: (editorView) => {
          let anchor: ContextPopupAnchor | null = null;

          return {
            update: (view, previousState) => {
              const previous = leafdownCodeBlockLanguagePluginKey.getState(previousState);
              const next = leafdownCodeBlockLanguagePluginKey.getState(view.state);

              if (next === previous) {
                return;
              }

              const node = next?.position == null ? null : view.state.doc.nodeAt(next.position);

              if (next?.position == null || !node) {
                if (previous?.position != null) {
                  options.onClose?.();
                }

                return;
              }

              anchor ??= createContextPopupAnchor(editorView);
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
          };
        },
      }),
  );
