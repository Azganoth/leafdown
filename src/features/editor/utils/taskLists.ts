import type { EditorView } from "@milkdown/kit/prose/view";

export const toggleTaskCheckedAt = (view: EditorView, pos: number) => {
  const node = view.state.doc.nodeAt(pos);

  if (node?.type.name !== "list_item" || node.attrs.checked == null) {
    return false;
  }

  const tr = view.state.tr.setNodeMarkup(
    pos,
    undefined,
    { ...node.attrs, checked: !node.attrs.checked },
    node.marks,
  );

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};
