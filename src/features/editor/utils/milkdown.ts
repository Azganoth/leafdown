import { editorViewCtx, type Editor } from "@milkdown/kit/core";
import type { MarkType, NodeType } from "@milkdown/kit/prose/model";
import {
  Selection,
  type Command,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

export const getEditorView = (editor: Editor) => editor.ctx.get(editorViewCtx);

export const withEditorView =
  <R>(func: (view: EditorView) => R) =>
  (editor: Editor) =>
    func(getEditorView(editor));

export const runProseMirrorCommand = (view: EditorView, command: Command) => {
  view.focus();
  return command(view.state, view.dispatch, view);
};

export const getNodeType = (state: EditorState, nodeName: string): NodeType | null =>
  state.schema.nodes[nodeName] ?? null;

export const getMarkType = (state: EditorState, name: string): MarkType | null =>
  state.schema.marks[name] ?? null;

export const setSelectionNear = (transaction: Transaction, position: number) => {
  const selection = Selection.findFrom(transaction.doc.resolve(position), 1, true);
  if (selection) {
    transaction.setSelection(selection);
  }
};
