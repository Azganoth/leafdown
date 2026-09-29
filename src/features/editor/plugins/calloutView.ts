import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { t } from "@/lib/i18n";

import { calloutSchema } from "./callout";

const toneFor = (token: string) => {
  if (["TIP", "SUCCESS"].includes(token)) return "success";
  if (["WARNING", "QUESTION", "EXAMPLE"].includes(token)) return "warning";
  if (["CAUTION", "DANGER", "FAILURE", "BUG"].includes(token)) return "danger";
  if (token === "IMPORTANT") return "important";
  return "info";
};

const isCollapsible = (node: ProseMirrorNode) =>
  (node.attrs.dialect === "mkdocs" && node.attrs.marker !== "!!!") ||
  (node.attrs.dialect === "vitepress" && node.attrs.token === "details");

const initiallyExpanded = (node: ProseMirrorNode) => node.attrs.marker === "???+";
const expandedCallouts = new WeakMap<EditorView, Map<string, boolean>>();
const expansionKey = (node: ProseMirrorNode, position: number | undefined) =>
  JSON.stringify([
    position,
    node.attrs.dialect,
    node.attrs.marker,
    node.attrs.token,
    node.attrs.title,
  ]);

const calloutExpansion = (view: EditorView, node: ProseMirrorNode, position: number | undefined) =>
  expandedCallouts.get(view)?.get(expansionKey(node, position));

const rememberExpansion = (
  view: EditorView,
  node: ProseMirrorNode,
  position: number | undefined,
  expanded: boolean,
) => {
  let entries = expandedCallouts.get(view);
  if (!entries) {
    entries = new Map();
    expandedCallouts.set(view, entries);
  }
  entries.set(expansionKey(node, position), expanded);
};

export const createLeafdownCalloutViewPlugin = () =>
  $view(calloutSchema.node, () => (node, view, getPos) => new CalloutNodeView(node, view, getPos));

class CalloutNodeView implements NodeView {
  readonly dom = document.createElement("aside");
  readonly contentDOM = document.createElement("div");
  private readonly header = document.createElement("div");
  private readonly toggle = document.createElement("button");
  private readonly label = document.createElement("span");
  private readonly title = document.createElement("input");
  private expanded: boolean;

  constructor(
    private node: ProseMirrorNode,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.expanded = calloutExpansion(view, node, getPos()) ?? initiallyExpanded(node);
    this.dom.className = "leafdown-callout";
    this.dom.dataset.leafdownCallout = "";
    this.header.className = "leafdown-callout-header";
    this.header.contentEditable = "false";
    this.contentDOM.className = "leafdown-callout-body";
    this.toggle.type = "button";
    this.toggle.className = "leafdown-callout-toggle";
    this.toggle.addEventListener("mousedown", this.handleToggleMouseDown);
    this.toggle.addEventListener("click", this.handleToggle);
    this.title.className = "leafdown-callout-title";
    this.title.type = "text";
    this.title.setAttribute("aria-label", t("editor.callout.title"));
    this.title.addEventListener("input", this.handleTitleInput);
    this.header.append(this.toggle, this.label, this.title);
    this.dom.append(this.header, this.contentDOM);
    this.render();
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;
    if (node.attrs.marker !== this.node.attrs.marker) this.expanded = initiallyExpanded(node);
    rememberExpansion(this.view, node, this.getPos(), this.expanded);
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event) {
    return event.target instanceof Node && this.header.contains(event.target);
  }

  ignoreMutation(mutation: MutationRecord | { target: Node; type: "selection" }) {
    return (
      this.header.contains(mutation.target) ||
      (mutation.type === "attributes" &&
        mutation.target === this.contentDOM &&
        mutation.attributeName === "hidden")
    );
  }

  destroy() {
    this.toggle.removeEventListener("mousedown", this.handleToggleMouseDown);
    this.toggle.removeEventListener("click", this.handleToggle);
    this.title.removeEventListener("input", this.handleTitleInput);
  }

  private render() {
    const { dialect, token, title, marker } = this.node.attrs;
    const collapsible = isCollapsible(this.node);
    const defaultTitle = String(token)
      .toLowerCase()
      .replace(/^./u, (character) => character.toUpperCase());
    this.dom.dataset.dialect = String(dialect);
    this.dom.dataset.token = String(token);
    this.dom.dataset.tone = toneFor(String(token).toUpperCase());
    this.dom.dataset.marker = String(marker);
    this.dom.dataset.gap = String(this.node.attrs.gap);
    this.dom.dataset.closingGap = String(this.node.attrs.closingGap);
    if (title === null) delete this.dom.dataset.title;
    else this.dom.dataset.title = String(title);
    this.toggle.hidden = !collapsible;
    this.toggle.style.display = collapsible ? "" : "none";
    this.toggle.textContent = this.expanded ? "▾" : "▸";
    this.toggle.setAttribute("aria-expanded", String(this.expanded));
    this.toggle.setAttribute(
      "aria-label",
      t(this.expanded ? "editor.callout.collapse" : "editor.callout.expand", {
        title: String(title ?? defaultTitle),
      }),
    );
    this.label.hidden = dialect !== "github";
    this.label.textContent = defaultTitle;
    this.title.hidden = dialect === "github";
    this.title.placeholder = title === "" ? "" : defaultTitle;
    if (this.title.value !== (title ?? "")) this.title.value = title ?? "";
    this.contentDOM.hidden = collapsible && !this.expanded;
  }

  private readonly handleToggle = () => {
    this.expanded = !this.expanded;
    rememberExpansion(this.view, this.node, this.getPos(), this.expanded);
    this.render();
  };

  private readonly handleToggleMouseDown = (event: MouseEvent) => {
    event.preventDefault();
  };

  private readonly handleTitleInput = () => {
    const position = this.getPos();
    if (position === undefined || !this.view.editable) return;
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(position, undefined, {
        ...this.node.attrs,
        title: this.title.value || null,
      }),
    );
  };
}
