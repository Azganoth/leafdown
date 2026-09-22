import { htmlSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { parseSafeHtml, type SafeHtmlRender } from "../utils/safeHtml";
import { SOURCE_PROJECTION_HTML_POINTER_SOURCE_OFFSET_META } from "./sourceProjection";

export const createLeafdownHtmlViewPlugin = () =>
  $view(
    htmlSchema.node,
    () => (node, view, getPos) => new LeafdownHtmlNodeView(node, view, getPos),
  );

class LeafdownHtmlNodeView implements NodeView {
  readonly dom = document.createElement("span");
  private fallbackText: Text | null = null;
  private rendered: SafeHtmlRender | null = null;

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.dom.contentEditable = "false";
    this.dom.dataset.type = "html";
    this.dom.addEventListener("mousedown", this.handleMouseDown);
    this.render();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }
    const changed = node.attrs.value !== this.node.attrs.value;
    this.node = node;
    if (changed) {
      this.render();
    }
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const position = this.getPos();
    if (position === undefined) return;
    const sourceOffset = this.getPointerSourceOffset(event);
    event.preventDefault();
    this.view.dispatch(
      this.view.state.tr
        .setSelection(TextSelection.create(this.view.state.doc, position))
        .setMeta(SOURCE_PROJECTION_HTML_POINTER_SOURCE_OFFSET_META, sourceOffset),
    );
    this.view.focus();
  };

  private getPointerSourceOffset(event: MouseEvent) {
    const caret = getCaretAtPoint(this.dom.ownerDocument, event.clientX, event.clientY);

    if (!caret || !this.dom.contains(caret.node)) {
      return 0;
    }

    if (this.rendered) {
      return this.rendered.getSourceOffset(caret.node, caret.offset) ?? 0;
    }

    return caret.node === this.fallbackText
      ? Math.min(Math.max(caret.offset, 0), this.fallbackText.length)
      : 0;
  }

  private render() {
    const source = this.node.attrs.value as string;
    const rendered = parseSafeHtml(source);
    const fallbackText = rendered ? null : document.createTextNode(source);
    this.rendered = rendered;
    this.fallbackText = fallbackText;
    this.dom.dataset.value = source;
    this.dom.dataset.htmlRendered = String(rendered !== null);
    if (rendered) {
      this.dom.dataset.htmlFlow = rendered.flow;
    } else {
      delete this.dom.dataset.htmlFlow;
    }
    this.dom.replaceChildren(rendered?.element ?? fallbackText!);
  }
}

interface CaretPoint {
  node: Node;
  offset: number;
}

const getCaretAtPoint = (document: Document, x: number, y: number): CaretPoint | null => {
  const position = document.caretPositionFromPoint?.(x, y);

  if (position) {
    return { node: position.offsetNode, offset: position.offset };
  }

  // Chromium WebView still provides this fallback when caretPositionFromPoint is unavailable.
  // oxlint-disable-next-line typescript/no-deprecated
  const range = document.caretRangeFromPoint(x, y);

  return range ? { node: range.startContainer, offset: range.startOffset } : null;
};
