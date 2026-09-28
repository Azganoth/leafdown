import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import type { RemarkPluginRaw } from "@milkdown/kit/transformer";
import { $nodeSchema, $remark, $view } from "@milkdown/kit/utils";

import { localizer } from "@/lib/i18n";

import { describeMathError, isInTableCell, renderMath } from "../utils/mathRender";
import { isDisplayMathSource, MATH_MARKDOWN_TYPE, mathSyntax } from "../utils/mathSyntax";
import { SOURCE_PROJECTION_HTML_POINTER_SOURCE_OFFSET_META } from "./sourceProjection";

export const MATH_NODE_NAME = "math_inline";

export const createLeafdownMathRemarkPlugin = () =>
  $remark(
    "leafdownMath",
    () =>
      function (this: ThisParameterType<RemarkPluginRaw<unknown>>) {
        const data = this.data();
        (data.micromarkExtensions ??= []).push(mathSyntax);
        (data.fromMarkdownExtensions ??= []).push({
          enter: {
            [MATH_MARKDOWN_TYPE](token) {
              this.enter({ type: MATH_MARKDOWN_TYPE, value: "" } as never, token);
            },
          },
          exit: {
            [MATH_MARKDOWN_TYPE](token) {
              const node = this.stack.at(-1) as { value?: string } | undefined;
              if (node) node.value = this.sliceSerialize(token);
              this.exit(token);
            },
          },
        });
      },
  );

export const leafdownMathSchema = $nodeSchema(MATH_NODE_NAME, () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { value: { default: "", validate: "string" } },
  parseDOM: [
    {
      tag: 'span[data-type="math"]',
      getAttrs: (dom) => ({ value: dom.dataset.value ?? "" }),
    },
  ],
  toDOM: (node) => [
    "span",
    { "data-type": "math", "data-value": node.attrs.value },
    node.attrs.value,
  ],
  parseMarkdown: {
    match: (node) => node.type === MATH_MARKDOWN_TYPE,
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === MATH_NODE_NAME,
    runner: (state, node) => {
      state.addNode(MATH_MARKDOWN_TYPE, undefined, node.attrs.value as string);
    },
  },
}));

export const serializeMath = (node: { value?: string }) => node.value ?? "";

export const createLeafdownMathViewPlugin = () =>
  $view(
    leafdownMathSchema.node,
    () => (node, view, getPos) => new LeafdownMathNodeView(node, view, getPos),
  );

class LeafdownMathNodeView implements NodeView {
  readonly dom = document.createElement("span");
  private error: string | null = null;
  private readonly localizationChange = localizer.onDidChange(() => this.describeError());

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.dom.contentEditable = "false";
    this.dom.dataset.type = "math";
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
    this.updateFlow();
    return true;
  }

  ignoreMutation() {
    return true;
  }

  stopEvent(event: Event) {
    return event instanceof MouseEvent && this.isScrollbarPress(event);
  }

  destroy() {
    this.localizationChange.dispose();
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
  }

  // A press on a wide display block's own scrollbar scrolls it rather than opening its source.
  private isScrollbarPress(event: MouseEvent) {
    return (
      event.target === this.dom &&
      this.dom.scrollWidth > this.dom.clientWidth &&
      event.offsetY >= this.dom.clientHeight
    );
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (this.isScrollbarPress(event)) return;
    const position = this.getPos();
    if (position === undefined) return;
    const source = this.node.attrs.value as string;
    event.preventDefault();
    this.view.dispatch(
      this.view.state.tr
        .setSelection(TextSelection.create(this.view.state.doc, position))
        .setMeta(
          SOURCE_PROJECTION_HTML_POINTER_SOURCE_OFFSET_META,
          isDisplayMathSource(source) ? 2 : 1,
        ),
    );
    this.view.focus();
  };

  private render() {
    const source = this.node.attrs.value as string;
    const position = this.getPos();
    const rendered = renderMath(
      source,
      position !== undefined && isInTableCell(this.view.state.doc.resolve(position)),
    );
    this.error = rendered.error;
    this.dom.dataset.value = source;
    this.dom.dataset.mathDisplay = String(isDisplayMathSource(source));
    this.dom.dataset.mathRendered = String(rendered.error === null);
    this.dom.replaceChildren(rendered.element ?? source);
    this.describeError();
    this.updateFlow();
  }

  private describeError() {
    if (this.error === null) {
      this.dom.removeAttribute("aria-description");
    } else {
      this.dom.setAttribute("aria-description", describeMathError(this.error));
    }
  }

  private updateFlow() {
    const position = this.getPos();
    const parent = position === undefined ? null : this.view.state.doc.resolve(position).parent;
    const alone = parent !== null && parent.childCount === 1;
    this.dom.dataset.mathFlow =
      alone && isDisplayMathSource(this.node.attrs.value as string) ? "block" : "inline";
  }
}
