import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { localizer, t } from "@/lib/i18n";

import { renderMermaid } from "../services/mermaidRenderer";
import { readCodeFenced } from "../utils/codeMarkdown";
import { describeMathError, renderMathTex } from "../utils/mathRender";
import { setCodeBlockLanguageRequestMeta } from "./codeBlockLanguage";
import { isEditingMermaidCodeBlock, isMermaidCodeBlock } from "./mermaidMode";

let nextMermaidDescriptionId = 0;
const MERMAID_EDIT_RENDER_DELAY = 400;

const mermaidSourceError = (source: string): string | null => {
  if (source.length > 10_000) return t("editor.mermaid.tooLong");
  if (/^---(?:\r?\n|$)/u.test(source) || source.includes("%%{")) {
    return t("editor.mermaid.configurationUnsupported");
  }
  return null;
};

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
  private readonly mermaidPanel = document.createElement("span");
  private readonly mermaidImage = document.createElement("img");
  private readonly mermaidSource = document.createElement("span");
  private readonly mermaidStatus = document.createElement("span");
  private readonly mermaidError = document.createElement("span");
  private mermaidImageUrl: string | null = null;
  private mermaidRenderedSource: string | null = null;
  private mermaidPendingSource: string | null = null;
  private mermaidAbort: AbortController | null = null;
  private mermaidDelay: number | null = null;
  private mermaidDelayedSource: string | null = null;
  private mermaidObserver: IntersectionObserver | null = null;
  private mermaidVisible = typeof IntersectionObserver === "undefined";
  private mermaidFailure: string | null = null;
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
    this.mermaidPanel.className = "leafdown-code-mermaid-panel";
    this.mermaidPanel.contentEditable = "false";
    this.mermaidPanel.addEventListener("mousedown", this.handleMermaidPanelMouseDown);
    this.mermaidImage.className = "leafdown-code-mermaid-image";
    this.mermaidSource.className = "sr-only";
    this.mermaidSource.id = `leafdown-mermaid-source-${++nextMermaidDescriptionId}`;
    this.mermaidImage.setAttribute("aria-describedby", this.mermaidSource.id);
    this.mermaidError.className = "leafdown-code-mermaid-error";
    this.mermaidError.setAttribute("role", "alert");
    this.mermaidStatus.className = "leafdown-code-mermaid-status";
    this.mermaidStatus.setAttribute("role", "status");
    this.mermaidPanel.append(
      this.mermaidImage,
      this.mermaidSource,
      this.mermaidStatus,
      this.mermaidError,
    );
    this.dom.append(this.badge, this.contentDOM, this.mathPreview, this.mermaidPanel);
    this.render();
    this.renderMath();
    this.renderMermaid();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) {
      return false;
    }

    const mathChanged =
      node.textContent !== this.node.textContent ||
      node.attrs.language !== this.node.attrs.language ||
      readCodeFenced(node.attrs) !== readCodeFenced(this.node.attrs);
    if (node.textContent !== this.node.textContent) this.mermaidFailure = null;
    this.node = node;
    this.render();
    if (mathChanged) this.renderMath();
    this.renderMermaid();

    return true;
  }

  stopEvent(event: Event) {
    return (
      event.target instanceof Node &&
      (this.badge.contains(event.target) ||
        this.mermaidPanel.contains(event.target) ||
        (this.mathPreview.contains(event.target) &&
          !(event instanceof MouseEvent && this.isPreviewScrollbarPress(event))))
    );
  }

  ignoreMutation(mutation: MutationRecord | { target: Node; type: "selection" }) {
    if (
      mutation.type === "attributes" &&
      mutation.target === this.dom &&
      (mutation.attributeName === "data-math-code-rendered" ||
        mutation.attributeName === "data-mermaid-mode" ||
        mutation.attributeName === "aria-description")
    ) {
      return true;
    }
    return (
      this.badge.contains(mutation.target) ||
      this.mathPreview.contains(mutation.target) ||
      this.mermaidPanel.contains(mutation.target)
    );
  }

  destroy() {
    this.localizationChange.dispose();
    this.badge.removeEventListener("mousedown", this.handleBadgeMouseDown);
    this.badge.removeEventListener("click", this.handleBadgeClick);
    this.mathPreview.removeEventListener("mousedown", this.handlePreviewMouseDown);
    this.mermaidPanel.removeEventListener("mousedown", this.handleMermaidPanelMouseDown);
    this.mermaidObserver?.disconnect();
    this.clearMermaidDelay();
    this.mermaidAbort?.abort();
    if (this.mermaidImageUrl) URL.revokeObjectURL(this.mermaidImageUrl);
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

  private renderMermaid() {
    if (!isMermaidCodeBlock(this.node)) {
      delete this.dom.dataset.mermaidMode;
      this.mermaidPanel.hidden = true;
      this.cancelMermaidRender();
      this.mermaidObserver?.disconnect();
      this.mermaidObserver = null;
      if (this.mermaidImageUrl) URL.revokeObjectURL(this.mermaidImageUrl);
      this.mermaidImageUrl = null;
      this.mermaidRenderedSource = null;
      return;
    }

    const source = this.node.textContent;
    const position = this.getPos();
    const editing = position === undefined || isEditingMermaidCodeBlock(this.view.state, position);
    const unsupported = mermaidSourceError(source);
    const current = this.mermaidRenderedSource === source;
    // While editing, the last diagram stays below the code until a newer one replaces it.
    const showImage =
      !unsupported &&
      this.mermaidImageUrl !== null &&
      (editing || (current && !this.mermaidFailure));
    this.dom.dataset.mermaidMode =
      editing || unsupported || this.mermaidFailure ? "source" : "diagram";
    this.mermaidPanel.hidden = false;
    this.mermaidSource.textContent = source;
    this.mermaidImage.alt = t("editor.mermaid.diagramName");
    this.mermaidError.textContent = unsupported ?? this.mermaidFailure ?? "";
    this.mermaidError.hidden = !this.mermaidError.textContent;
    this.mermaidImage.hidden = !showImage;
    this.mermaidStatus.textContent = t("editor.mermaid.rendering");
    this.mermaidStatus.hidden = showImage || current || !!unsupported || !!this.mermaidFailure;

    if (unsupported || this.mermaidFailure) {
      this.cancelMermaidRender();
      return;
    }
    if (!this.mermaidObserver && typeof IntersectionObserver !== "undefined") {
      this.mermaidObserver = new IntersectionObserver((entries) => {
        this.mermaidVisible = entries.some((entry) => entry.isIntersecting);
        if (this.mermaidVisible) this.renderMermaid();
      });
      this.mermaidObserver.observe(this.dom);
    }
    if (!this.mermaidVisible || current || this.mermaidPendingSource === source) return;
    if (!editing) {
      this.clearMermaidDelay();
      this.startMermaidRender(source);
      return;
    }
    if (this.mermaidDelayedSource === source) return;

    this.clearMermaidDelay();
    this.mermaidDelayedSource = source;
    this.mermaidDelay = window.setTimeout(() => {
      this.mermaidDelay = null;
      this.mermaidDelayedSource = null;
      if (this.node.textContent === source) this.startMermaidRender(source);
    }, MERMAID_EDIT_RENDER_DELAY);
  }

  private startMermaidRender(source: string) {
    this.mermaidAbort?.abort();
    const controller = new AbortController();
    this.mermaidAbort = controller;
    this.mermaidPendingSource = source;
    renderMermaid(source, controller.signal)
      .then((svg) => {
        if (controller.signal.aborted || this.node.textContent !== source) return;
        if (this.mermaidImageUrl) URL.revokeObjectURL(this.mermaidImageUrl);
        this.mermaidImageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        this.mermaidImage.src = this.mermaidImageUrl;
        this.mermaidRenderedSource = source;
        this.renderMermaid();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || this.node.textContent !== source) return;
        this.mermaidFailure = String(error);
        this.renderMermaid();
      })
      .finally(() => {
        if (this.mermaidAbort === controller) this.mermaidAbort = null;
        if (this.mermaidPendingSource === source) this.mermaidPendingSource = null;
      });
  }

  private cancelMermaidRender() {
    this.clearMermaidDelay();
    this.mermaidAbort?.abort();
    this.mermaidAbort = null;
    this.mermaidPendingSource = null;
  }

  private clearMermaidDelay() {
    if (this.mermaidDelay !== null) window.clearTimeout(this.mermaidDelay);
    this.mermaidDelay = null;
    this.mermaidDelayedSource = null;
  }

  private readonly handleMermaidPanelMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const position = this.getPos();
    if (position === undefined || !this.view.editable) return;
    event.preventDefault();
    if (!isEditingMermaidCodeBlock(this.view.state, position)) {
      this.view.dispatch(
        this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, position + 1)),
      );
    }
    this.view.focus();
  };

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
