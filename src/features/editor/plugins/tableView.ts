import { tableSchema } from "@milkdown/kit/preset/gfm";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

export const createLeafdownTableViewPlugin = () =>
  $view(tableSchema.node, () => (initialNode) => new LeafdownTableNodeView(initialNode));

class LeafdownTableNodeView implements NodeView {
  readonly dom = document.createElement("div");
  readonly contentDOM: HTMLElement;

  private node: ProseMirrorNode;

  constructor(initialNode: ProseMirrorNode) {
    this.node = initialNode;
    this.dom.className = "tableWrapper";
    this.contentDOM = this.dom
      .appendChild(document.createElement("table"))
      .appendChild(document.createElement("tbody"));
  }

  // Without this the wrapper is torn down and rebuilt on every keystroke inside a cell, which
  // takes the scroll offset with it.
  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;

    return true;
  }

  // The fitted `colgroup` is the view's own chrome and lives outside the content, so the editor is
  // told to leave it alone. Without this, writing one reads as a foreign change to the editable
  // area, and the redraw it provokes asks for another fit.
  ignoreMutation(mutation: MutationRecord | { target: Node; type: "selection" }) {
    return !this.contentDOM.contains(mutation.target);
  }
}
