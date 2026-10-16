import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Decoration, EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { localizer, t } from "@/lib/i18n";

import type { MermaidTheme } from "../services/mermaidMessages";
import { renderMermaid } from "../services/mermaidRenderer";
import { onMermaidThemeChange, readMermaidTheme } from "../services/mermaidTheme";
import { readCodeFenced } from "../utils/codeMarkdown";
import { describeMathError, renderMathTex } from "../utils/mathRender";
import {
  collapseAllCodeBlocks,
  collapseCodeBlock,
  countCollapsedCodeLines,
  expandAllCodeBlocks,
  expandCodeBlock,
  readCodeBlockCollapse,
  type CodeBlockCollapse,
} from "./codeBlockCollapse";
import {
  onCodeBlockControlsChange,
  readCodeBlockControls,
  type CodeBlockSetting,
} from "./codeBlockControls";
import { setCodeBlockLanguageRequestMeta } from "./codeBlockLanguage";
import { isEditingMermaidCodeBlock, isMermaidCodeBlock } from "./mermaidMode";

let nextMermaidDescriptionId = 0;
const MERMAID_EDIT_RENDER_DELAY = 400;

export interface LeafdownCodeBlockViewOptions {
  onSettingChange?: (setting: CodeBlockSetting, enabled: boolean) => void;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const EXPAND_ALL_ICON = [
  "M12 22v-6",
  "M12 8V2",
  "M4 12H2",
  "M10 12H8",
  "M16 12h-2",
  "M22 12h-2",
  "m15 19-3 3-3-3",
  "m15 5-3-3-3 3",
];
const SOFT_WRAP_ICON = ["m16 16-3 3 3 3", "M3 12h14.5a1 1 0 0 1 0 7H13", "M3 19h6", "M3 5h18"];
const LINE_NUMBERS_ICON = [
  "M11 5h10",
  "M11 12h10",
  "M11 19h10",
  "M4 4h1v5",
  "M4 9h2",
  "M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02",
];

export const mermaidSourceError = (source: string): string | null => {
  if (source.length > 10_000) return t("editor.mermaid.tooLong");
  if (/^---(?:\r?\n|$)/u.test(source) || source.includes("%%{")) {
    return t("editor.mermaid.configurationUnsupported");
  }
  return null;
};

export const createLeafdownCodeBlockViewPlugin = (options: LeafdownCodeBlockViewOptions = {}) =>
  $view(
    codeBlockSchema.node,
    () => (node, view, getPos, decorations) =>
      new LeafdownCodeBlockNodeView(node, view, getPos, decorations, options),
  );

const createChevron = () => {
  const chevron = document.createElement("span");
  chevron.className = "leafdown-code-chevron";
  chevron.setAttribute("aria-hidden", "true");
  return chevron;
};

const createIcon = (paths: readonly string[]) => {
  const icon = document.createElementNS(SVG_NAMESPACE, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  for (const data of paths) {
    const path = document.createElementNS(SVG_NAMESPACE, "path");
    path.setAttribute("d", data);
    icon.append(path);
  }
  return icon;
};

class LeafdownCodeBlockNodeView implements NodeView {
  readonly dom = document.createElement("pre");
  readonly contentDOM = document.createElement("code");
  private readonly badge = document.createElement("button");
  private readonly collapseButton = document.createElement("button");
  private readonly expandButton = document.createElement("button");
  private readonly expandLabel = document.createElement("span");
  private readonly header = document.createElement("span");
  private readonly controls = document.createElement("span");
  private readonly expandAllButton = document.createElement("button");
  private readonly softWrapButton = document.createElement("button");
  private readonly lineNumbersButton = document.createElement("button");
  private readonly controlsChange: () => void;
  private collapse: CodeBlockCollapse | null;
  private readonly mathPreview = document.createElement("span");
  private readonly mermaidPanel = document.createElement("span");
  private readonly mermaidImage = document.createElement("img");
  private readonly mermaidSource = document.createElement("span");
  private readonly mermaidStatus = document.createElement("span");
  private readonly mermaidError = document.createElement("span");
  private mermaidImageUrl: string | null = null;
  private mermaidRenderedSource: string | null = null;
  private mermaidRenderedKey: string | null = null;
  private mermaidPendingKey: string | null = null;
  private mermaidAbort: AbortController | null = null;
  private mermaidDelay: number | null = null;
  private mermaidDelayedKey: string | null = null;
  private mermaidThemeChange: (() => void) | null = null;
  private mermaidObserver: IntersectionObserver | null = null;
  private mermaidVisible = typeof IntersectionObserver === "undefined";
  private mermaidFailure: string | null = null;
  private mathError: string | null = null;
  private readonly localizationChange = localizer.onDidChange(() => {
    this.render();
    this.renderControls();
  });

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    decorations: readonly Decoration[],
    private readonly options: LeafdownCodeBlockViewOptions,
  ) {
    this.collapse = readCodeBlockCollapse(decorations);
    this.badge.type = "button";
    this.badge.contentEditable = "false";
    // Reached by keyboard through `Code block language...`, so the badge costs no tab stop in text.
    this.badge.tabIndex = -1;
    this.badge.className = "leafdown-code-language";
    this.badge.dataset.leafdownCodeLanguage = "";
    this.badge.addEventListener("mousedown", this.handleChromeMouseDown);
    this.badge.addEventListener("click", this.handleBadgeClick);
    // Like the badge, the collapse controls cost no tab stop; `Fold or unfold section` reaches them.
    for (const button of [this.collapseButton, this.expandButton]) {
      button.type = "button";
      button.contentEditable = "false";
      button.tabIndex = -1;
      button.addEventListener("mousedown", this.handleChromeMouseDown);
    }
    // The controls that act on every code block cost no tab stop either; Preferences holds both
    // settings, and `Fold or unfold section` expands a block from its caret.
    this.controls.className = "leafdown-code-controls";
    for (const [button, icon, handleClick] of [
      [this.expandAllButton, EXPAND_ALL_ICON, this.handleExpandAllClick],
      [this.softWrapButton, SOFT_WRAP_ICON, this.handleSoftWrapClick],
      [this.lineNumbersButton, LINE_NUMBERS_ICON, this.handleLineNumbersClick],
    ] as const) {
      button.type = "button";
      button.tabIndex = -1;
      button.className = "leafdown-code-control";
      button.append(createIcon(icon));
      button.addEventListener("mousedown", this.handleChromeMouseDown);
      button.addEventListener("click", handleClick);
      this.controls.append(button);
    }
    this.controlsChange = onCodeBlockControlsChange(view, () => this.renderControls());
    this.collapseButton.className = "leafdown-code-collapse";
    this.collapseButton.setAttribute("aria-expanded", "true");
    this.collapseButton.append(createChevron());
    this.collapseButton.addEventListener("click", this.handleCollapseClick);
    this.expandButton.className = "leafdown-code-expand";
    this.expandButton.setAttribute("aria-expanded", "false");
    this.expandButton.append(createChevron(), this.expandLabel);
    this.expandButton.addEventListener("click", this.handleExpandClick);
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
    this.header.className = "leafdown-code-header";
    this.header.contentEditable = "false";
    this.header.append(this.controls, this.collapseButton, this.badge);
    this.dom.append(
      this.header,
      this.contentDOM,
      this.expandButton,
      this.mathPreview,
      this.mermaidPanel,
    );
    this.render();
    this.renderControls();
    this.renderMath();
    this.renderMermaid();
  }

  update(node: ProseMirrorNode, decorations: readonly Decoration[]) {
    if (node.type !== this.node.type) {
      return false;
    }

    this.collapse = readCodeBlockCollapse(decorations);
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
      (this.header.contains(event.target) ||
        this.expandButton.contains(event.target) ||
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
      this.header.contains(mutation.target) ||
      this.expandButton.contains(mutation.target) ||
      this.mathPreview.contains(mutation.target) ||
      this.mermaidPanel.contains(mutation.target)
    );
  }

  destroy() {
    this.localizationChange.dispose();
    this.badge.removeEventListener("mousedown", this.handleChromeMouseDown);
    this.badge.removeEventListener("click", this.handleBadgeClick);
    this.collapseButton.removeEventListener("mousedown", this.handleChromeMouseDown);
    this.collapseButton.removeEventListener("click", this.handleCollapseClick);
    this.expandButton.removeEventListener("mousedown", this.handleChromeMouseDown);
    this.expandButton.removeEventListener("click", this.handleExpandClick);
    this.controlsChange();
    for (const [button, handleClick] of [
      [this.expandAllButton, this.handleExpandAllClick],
      [this.softWrapButton, this.handleSoftWrapClick],
      [this.lineNumbersButton, this.handleLineNumbersClick],
    ] as const) {
      button.removeEventListener("mousedown", this.handleChromeMouseDown);
      button.removeEventListener("click", handleClick);
    }
    this.mathPreview.removeEventListener("mousedown", this.handlePreviewMouseDown);
    this.mermaidPanel.removeEventListener("mousedown", this.handleMermaidPanelMouseDown);
    this.mermaidObserver?.disconnect();
    this.mermaidThemeChange?.();
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

    this.collapseButton.hidden = this.collapse !== "expanded";
    this.expandButton.hidden = this.collapse !== "collapsed";
    const collapseLabel = t("editor.codeBlock.collapse");
    this.collapseButton.setAttribute("aria-label", collapseLabel);
    this.collapseButton.title = collapseLabel;
    if (this.collapse === "collapsed") {
      this.expandLabel.textContent = t("editor.codeBlock.expand", {
        count: countCollapsedCodeLines(this.node),
      });
    }
  }

  private renderControls() {
    const { collapsible, expanded, lineNumbers, softWrap } = readCodeBlockControls(this.view.state);
    this.expandAllButton.hidden = !collapsible;
    for (const [button, label, pressed] of [
      [this.expandAllButton, t("editor.codeBlock.expandAll"), expanded],
      [this.softWrapButton, t("editor.codeBlock.softWrap"), softWrap],
      [this.lineNumbersButton, t("editor.codeBlock.lineNumbers"), lineNumbers],
    ] as const) {
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", String(pressed));
      button.title = label;
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
      this.mermaidThemeChange?.();
      this.mermaidThemeChange = null;
      if (this.mermaidImageUrl) URL.revokeObjectURL(this.mermaidImageUrl);
      this.mermaidImageUrl = null;
      this.mermaidRenderedSource = null;
      this.mermaidRenderedKey = null;
      return;
    }

    const source = this.node.textContent;
    const position = this.getPos();
    const editing = position === undefined || isEditingMermaidCodeBlock(this.view.state, position);
    const unsupported = mermaidSourceError(source);
    const current = this.mermaidRenderedSource === source;
    // The last diagram stays until a newer one replaces it, while editing or after a theme change.
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
    this.mermaidThemeChange ??= onMermaidThemeChange(() => this.renderMermaid());
    if (!this.mermaidVisible) return;

    const { theme, key: themeKey } = readMermaidTheme(this.dom);
    const key = `${themeKey}
${source}`;
    if (this.mermaidRenderedKey === key || this.mermaidPendingKey === key) return;
    if (!editing) {
      this.clearMermaidDelay();
      this.startMermaidRender(source, theme, key);
      return;
    }
    if (this.mermaidDelayedKey === key) return;

    this.clearMermaidDelay();
    this.mermaidDelayedKey = key;
    this.mermaidDelay = window.setTimeout(() => {
      this.mermaidDelay = null;
      this.mermaidDelayedKey = null;
      if (this.node.textContent === source) this.startMermaidRender(source, theme, key);
    }, MERMAID_EDIT_RENDER_DELAY);
  }

  private startMermaidRender(source: string, theme: MermaidTheme, key: string) {
    this.mermaidAbort?.abort();
    const controller = new AbortController();
    this.mermaidAbort = controller;
    this.mermaidPendingKey = key;
    renderMermaid(source, theme, controller.signal)
      .then((svg) => {
        if (controller.signal.aborted || this.node.textContent !== source) return;
        if (this.mermaidImageUrl) URL.revokeObjectURL(this.mermaidImageUrl);
        this.mermaidImageUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        this.mermaidImage.src = this.mermaidImageUrl;
        this.mermaidRenderedSource = source;
        this.mermaidRenderedKey = key;
        this.renderMermaid();
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || this.node.textContent !== source) return;
        this.mermaidFailure = String(error);
        this.renderMermaid();
      })
      .finally(() => {
        if (this.mermaidAbort === controller) this.mermaidAbort = null;
        if (this.mermaidPendingKey === key) this.mermaidPendingKey = null;
      });
  }

  private cancelMermaidRender() {
    this.clearMermaidDelay();
    this.mermaidAbort?.abort();
    this.mermaidAbort = null;
    this.mermaidPendingKey = null;
  }

  private clearMermaidDelay() {
    if (this.mermaidDelay !== null) window.clearTimeout(this.mermaidDelay);
    this.mermaidDelay = null;
    this.mermaidDelayedKey = null;
  }

  private readonly handleMermaidPanelMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)
      return;
    if (event.target === this.mermaidPanel) return;
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
  private readonly handleChromeMouseDown = (event: MouseEvent) => {
    event.preventDefault();
  };

  private readonly handleCollapseClick = () => {
    const position = this.getPos();
    if (position !== undefined) collapseCodeBlock(this.view, position);
  };

  private readonly handleExpandClick = () => {
    const position = this.getPos();
    if (position !== undefined) expandCodeBlock(this.view, position);
  };

  private readonly handleExpandAllClick = () => {
    if (readCodeBlockControls(this.view.state).expanded) {
      collapseAllCodeBlocks(this.view);
    } else {
      expandAllCodeBlocks(this.view);
    }
  };

  private readonly handleSoftWrapClick = () => {
    this.options.onSettingChange?.(
      "softWrapCodeBlocks",
      !readCodeBlockControls(this.view.state).softWrap,
    );
  };

  private readonly handleLineNumbersClick = () => {
    this.options.onSettingChange?.(
      "displayCodeBlockLineNumbers",
      !readCodeBlockControls(this.view.state).lineNumbers,
    );
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
