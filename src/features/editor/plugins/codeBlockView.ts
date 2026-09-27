import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { readCodeFenced } from "../utils/codeMarkdown";
import { setCodeBlockLanguageRequestMeta } from "./codeBlockLanguage";

const EMPTY_BADGE_LABEL = "Language";

export const createLeafdownCodeBlockViewPlugin = () =>
  $view(
    codeBlockSchema.node,
    () => (node, view, getPos) => new LeafdownCodeBlockNodeView(node, view, getPos),
  );

class LeafdownCodeBlockNodeView implements NodeView {
  readonly dom = document.createElement("pre");
  readonly contentDOM = document.createElement("code");
  private readonly badge = document.createElement("button");

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.badge.type = "button";
    this.badge.contentEditable = "false";
    // Reached by keyboard through `Code block language...`, so the badge costs no tab stop in text.
    this.badge.tabIndex = -1;
    this.badge.className = "leafdown-code-language";
    this.badge.dataset.leafdownCodeLanguage = "";
    this.badge.addEventListener("mousedown", this.handleBadgeMouseDown);
    this.badge.addEventListener("click", this.handleBadgeClick);
    this.dom.append(this.badge, this.contentDOM);
    this.render();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.node = node;
    this.render();

    return true;
  }

  stopEvent(event: Event) {
    return event.target instanceof Node && this.badge.contains(event.target);
  }

  ignoreMutation(mutation: MutationRecord | { target: Node; type: "selection" }) {
    return this.badge.contains(mutation.target);
  }

  destroy() {
    this.badge.removeEventListener("mousedown", this.handleBadgeMouseDown);
    this.badge.removeEventListener("click", this.handleBadgeClick);
  }

  private render() {
    const language = this.node.attrs.language as string;

    if (language) {
      this.dom.dataset.language = language;
    } else {
      delete this.dom.dataset.language;
    }

    // Indented code has no fence line to carry a language on.
    this.badge.hidden = !readCodeFenced(this.node.attrs);
    this.badge.textContent = language || EMPTY_BADGE_LABEL;
    this.badge.setAttribute(
      "aria-label",
      language ? `Code block language: ${language}` : "Set code block language",
    );
  }

  // Leaves the editor's selection where it was rather than letting the press move it.
  private readonly handleBadgeMouseDown = (event: MouseEvent) => {
    event.preventDefault();
  };

  private readonly handleBadgeClick = () => {
    const position = this.getPos();

    if (position === undefined || !this.view.editable) {
      return;
    }

    this.view.dispatch(
      setCodeBlockLanguageRequestMeta(this.view.state.tr, { type: "open", position }),
    );
  };
}
