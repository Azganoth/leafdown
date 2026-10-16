import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { codeBlockCollapsePluginKey, readCodeBlockCollapseSummary } from "./codeBlockCollapse";
import { areCodeLineNumbersEnabled } from "./codeLineNumbers";

export type CodeBlockSetting = "displayCodeBlockLineNumbers" | "softWrapCodeBlocks";

export interface CodeBlockControlsState {
  collapsible: boolean;
  expanded: boolean;
  lineNumbers: boolean;
  softWrap: boolean;
}

const codeBlockSoftWrapPluginKey = new PluginKey<boolean>("leafdownCodeBlockSoftWrap");

const listeners = new WeakMap<EditorView, Set<() => void>>();

export const isCodeBlockSoftWrapEnabled = (state: EditorState) =>
  codeBlockSoftWrapPluginKey.getState(state) ?? false;

// Soft wrap is drawn by a style on the editor's host; the editor keeps a copy only for the
// controls that show it, set by a transaction that neither dirties the document nor enters its
// history.
export const setCodeBlockSoftWrapEnabled = (view: EditorView, enabled: boolean) => {
  if (isCodeBlockSoftWrapEnabled(view.state) === enabled) return;
  view.dispatch(
    view.state.tr.setMeta(codeBlockSoftWrapPluginKey, enabled).setMeta("addToHistory", false),
  );
};

export const readCodeBlockControls = (state: EditorState): CodeBlockControlsState => ({
  ...readCodeBlockCollapseSummary(state),
  lineNumbers: areCodeLineNumbersEnabled(state),
  softWrap: isCodeBlockSoftWrapEnabled(state),
});

const sameControls = (left: CodeBlockControlsState, right: CodeBlockControlsState) =>
  left.collapsible === right.collapsible &&
  left.expanded === right.expanded &&
  left.lineNumbers === right.lineNumbers &&
  left.softWrap === right.softWrap;

// The controls on every code block reflect the whole document, which a block's own NodeView
// updates never report, so each view subscribes here instead.
export const onCodeBlockControlsChange = (view: EditorView, listener: () => void) => {
  let viewListeners = listeners.get(view);
  if (!viewListeners) {
    viewListeners = new Set();
    listeners.set(view, viewListeners);
  }
  viewListeners.add(listener);
  return () => {
    viewListeners.delete(listener);
  };
};

export const createCodeBlockControlsPlugin = (isSoftWrapEnabled: () => boolean) =>
  new Plugin<boolean>({
    key: codeBlockSoftWrapPluginKey,
    state: {
      init: () => isSoftWrapEnabled(),
      apply: (transaction, value) =>
        (transaction.getMeta(codeBlockSoftWrapPluginKey) as boolean | undefined) ?? value,
    },
    view: (editorView) => {
      let controls = readCodeBlockControls(editorView.state);
      return {
        update: (view, previous) => {
          const { state } = view;
          if (
            codeBlockCollapsePluginKey.getState(state) ===
              codeBlockCollapsePluginKey.getState(previous) &&
            areCodeLineNumbersEnabled(state) === areCodeLineNumbersEnabled(previous) &&
            isCodeBlockSoftWrapEnabled(state) === isCodeBlockSoftWrapEnabled(previous)
          ) {
            return;
          }
          const next = readCodeBlockControls(state);
          if (sameControls(controls, next)) return;
          controls = next;
          for (const listener of listeners.get(view) ?? []) listener();
        },
      };
    },
  });

export const createLeafdownCodeBlockControlsPlugin = (isSoftWrapEnabled: () => boolean) =>
  $prose(() => createCodeBlockControlsPlugin(isSoftWrapEnabled));
