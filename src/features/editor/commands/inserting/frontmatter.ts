import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { FRONTMATTER_NODE_NAME, type FrontmatterFormat } from "../../plugins/frontmatter";

export const canInsertFrontmatter = (state: EditorState) =>
  state.doc.firstChild?.type.name !== FRONTMATTER_NODE_NAME &&
  state.schema.nodes[FRONTMATTER_NODE_NAME] !== undefined;

export const insertFrontmatter = (view: EditorView, format: FrontmatterFormat) => {
  const { state } = view;
  if (!canInsertFrontmatter(state)) return false;
  const node = state.schema.nodes[FRONTMATTER_NODE_NAME].create({ format });
  const transaction = state.tr.insert(0, node);
  transaction.setSelection(TextSelection.create(transaction.doc, 1));
  view.dispatch(transaction.scrollIntoView());
  view.focus();
  return true;
};
