import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import type { RemarkPluginRaw } from "@milkdown/kit/transformer";
import { $nodeSchema, $remark, $view } from "@milkdown/kit/utils";

import { localizer, t } from "@/lib/i18n";

import { CITATION_MARKDOWN_TYPE, citationSyntax } from "../utils/citationSyntax";
import { getCaretAtPoint } from "./htmlView";
import { SOURCE_PROJECTION_HTML_POINTER_SOURCE_OFFSET_META } from "./sourceProjection";

export const CITATION_NODE_NAME = "citation";

export const createLeafdownCitationRemarkPlugin = () =>
  $remark(
    "leafdownCitation",
    () =>
      function (this: ThisParameterType<RemarkPluginRaw<unknown>>) {
        const data = this.data();
        (data.micromarkExtensions ??= []).push(citationSyntax);
        (data.fromMarkdownExtensions ??= []).push({
          enter: {
            [CITATION_MARKDOWN_TYPE](token) {
              this.enter({ type: CITATION_MARKDOWN_TYPE, value: "" } as never, token);
            },
          },
          exit: {
            [CITATION_MARKDOWN_TYPE](token) {
              const node = this.stack.at(-1) as { value?: string } | undefined;
              if (node) node.value = this.sliceSerialize(token);
              this.exit(token);
            },
          },
        });
      },
  );

export const leafdownCitationSchema = $nodeSchema(CITATION_NODE_NAME, () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  leafText: (node) => node.attrs.value as string,
  attrs: { value: { default: "", validate: "string" } },
  parseDOM: [
    {
      tag: 'span[data-type="citation"]',
      getAttrs: (dom) => ({ value: dom.dataset.value ?? "" }),
    },
  ],
  toDOM: (node) => [
    "span",
    { "data-type": "citation", "data-value": node.attrs.value },
    node.attrs.value,
  ],
  parseMarkdown: {
    match: (node) => node.type === CITATION_MARKDOWN_TYPE,
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === CITATION_NODE_NAME,
    runner: (state, node) => {
      state.addNode(CITATION_MARKDOWN_TYPE, undefined, node.attrs.value as string);
    },
  },
}));

export const serializeCitation = (node: { value?: string }) => node.value ?? "";

export const createLeafdownCitationViewPlugin = () =>
  $view(
    leafdownCitationSchema.node,
    () => (node, view, getPos) => new LeafdownCitationNodeView(node, view, getPos),
  );

const SOURCE_WHITESPACE_PATTERN = /\s+/gu;

// The citation shows the group as the file spells it, so a pointer lands on the source offset of the
// character it presses and the projection opens with the caret there.
class LeafdownCitationNodeView implements NodeView {
  readonly dom = document.createElement("span");
  private readonly text = document.createTextNode("");
  private readonly localizationChange = localizer.onDidChange(() => this.describe());

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.dom.contentEditable = "false";
    this.dom.dataset.type = "citation";
    this.dom.setAttribute("role", "doc-biblioref");
    this.dom.append(this.text);
    this.dom.addEventListener("mousedown", this.handleMouseDown);
    this.render();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;
    const changed = node.attrs.value !== this.node.attrs.value;
    this.node = node;
    if (changed) this.render();
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.localizationChange.dispose();
    this.dom.removeEventListener("mousedown", this.handleMouseDown);
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const position = this.getPos();
    if (position === undefined) return;
    const caret = getCaretAtPoint(this.dom.ownerDocument, event.clientX, event.clientY);
    const offset = caret?.node === this.text ? caret.offset : 1;
    event.preventDefault();
    this.view.dispatch(
      this.view.state.tr
        .setSelection(TextSelection.create(this.view.state.doc, position))
        .setMeta(SOURCE_PROJECTION_HTML_POINTER_SOURCE_OFFSET_META, offset),
    );
    this.view.focus();
  };

  private render() {
    const source = this.node.attrs.value as string;
    this.dom.dataset.value = source;
    this.text.data = source;
    this.describe();
  }

  private describe() {
    const source = (this.node.attrs.value as string).replace(SOURCE_WHITESPACE_PATTERN, " ");
    this.dom.setAttribute("aria-label", t("editor.citation.name", { source }));
  }
}
