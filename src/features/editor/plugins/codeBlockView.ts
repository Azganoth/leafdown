import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { localizer, t } from "@/lib/i18n";

import { readCodeFenced } from "../utils/codeMarkdown";
import { describeMathError, renderMathTex } from "../utils/mathRender";
import { setCodeBlockLanguageRequestMeta } from "./codeBlockLanguage";

export const createLeafdownCodeBlockViewPlugin = () =>
  $view(
    codeBlockSchema.node,
    () => (node, view, getPos) => new LeafdownCodeBlockNodeView(node, view, getPos),
  );

class LeafdownCodeBlockNodeView implements NodeView {
  readonly dom = document.createElement("pre");
  readonly contentDOM = document.createElement("code");
  private readonly badge = document.createElement("button");
  private readonly mathPreview = document.createElement("span");
  private mathError: string | null = null;
  private readonly localizationChange = localizer.onDidChange(() => this.render());

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
    this.mathPreview.className = "leafdown-code-math-preview";
    this.mathPreview.contentEditable = "false";
    this.mathPreview.addEventListener("mousedown", this.handlePreviewMouseDown);
    this.dom.append(this.badge, this.contentDOM, this.mathPreview);
    this.render();
    this.renderMath();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }

    const mathChanged =
      node.textContent !== this.node.textContent ||
      node.attrs.language !== this.node.attrs.language ||
      readCodeFenced(node.attrs) !== readCodeFenced(this.node.attrs);
    this.node = node;
    this.render();
    if (mathChanged) this.renderMath();

    return true;
  }

  stopEvent(event: Event) {
    return (
      event.target instanceof Node &&
      (this.badge.contains(event.target) ||
        (this.mathPreview.contains(event.target) &&
          !(event instanceof MouseEvent && this.isPreviewScrollbarPress(event))))
    );
  }

  ignoreMutation(mutation: MutationRecord | { target: Node; type: "selection" }) {
    if (
      mutation.type === "attributes" &&
      mutation.target === this.dom &&
      (mutation.attributeName === "data-math-code-rendered" ||
        mutation.attributeName === "aria-description")
    ) {
      return true;
    }
    return this.badge.contains(mutation.target) || this.mathPreview.contains(mutation.target);
  }

  destroy() {
    this.localizationChange.dispose();
    this.badge.removeEventListener("mousedown", this.handleBadgeMouseDown);
    this.badge.removeEventListener("click", this.handleBadgeClick);
    this.mathPreview.removeEventListener("mousedown", this.handlePreviewMouseDown);
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
    this.badge.textContent = language || t("editor.codeBlock.badge.empty");
    this.badge.setAttribute(
      "aria-label",
      language
        ? t("editor.codeBlock.badge.label", { language })
        : t("editor.codeBlock.badge.emptyLabel"),
    );
    if (this.mathError === null) {
      this.dom.removeAttribute("aria-description");
    } else {
      this.dom.setAttribute("aria-description", describeMathError(this.mathError));
      this.mathPreview.textContent = describeMathError(this.mathError);
    }
  }

  private renderMath() {
    if (!readCodeFenced(this.node.attrs) || this.node.attrs.language !== "math") {
      delete this.dom.dataset.mathCodeRendered;
      this.mathError = null;
      this.mathPreview.replaceChildren();
      this.mathPreview.hidden = true;
      this.dom.removeAttribute("aria-description");
      return;
    }

    const rendered = renderMathTex(this.node.textContent, true);
    this.mathError = rendered.error;
    this.dom.dataset.mathCodeRendered = String(rendered.error === null);
    this.mathPreview.hidden = false;
    this.mathPreview.replaceChildren(rendered.element ?? describeMathError(rendered.error));
    if (rendered.error === null) {
      this.dom.removeAttribute("aria-description");
    } else {
      this.dom.setAttribute("aria-description", describeMathError(rendered.error));
    }
  }

  private readonly handlePreviewMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (this.isPreviewScrollbarPress(event)) return;
    const position = this.getPos();
    if (position === undefined || !this.view.editable) return;
    event.preventDefault();
    this.view.dispatch(
      this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, position + 1)),
    );
    this.view.focus();
  };

  private isPreviewScrollbarPress(event: MouseEvent) {
    return (
      event.target === this.mathPreview &&
      this.mathPreview.scrollWidth > this.mathPreview.clientWidth &&
      event.offsetY >= this.mathPreview.clientHeight
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
