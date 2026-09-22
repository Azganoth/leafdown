import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import {
  BlockSelection,
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
  getSelectedBlockTargets,
} from "./blockSelection";
import { isStructuralBlockSelection } from "./blockSelectionKeyboard";
import {
  canMoveSelectedBlocksToBoundary,
  moveSelectedBlocksToBoundary,
} from "./blockSelectionOperations";

export const leafdownBlockSelectionPluginKey = new PluginKey("leafdownBlockSelection");

const BLOCK_HANDLE_SELECTOR = "[data-leafdown-block-handle]";
const BLOCK_DRAG_THRESHOLD = 5;

const getBlockName = (node: ProseMirrorNode) => {
  switch (node.type.name) {
    case "blockquote":
      return "Block quote";
    case "bullet_list":
    case "ordered_list":
      return "List";
    case "code_block":
      return "Code block";
    case "footnote_definition":
      return "Footnote definition";
    case "heading":
      return `Heading ${String(node.attrs.level ?? 1)}`;
    case "horizontal_rule":
    case "thematic_break":
      return "Horizontal rule";
    case "list_item":
      return "List item";
    case "paragraph":
      return "Paragraph";
    case "table":
      return "Table";
    default:
      return "Block";
  }
};

const getSelectionDecorations = (state: EditorState) => {
  const selectedTargets =
    state.selection instanceof BlockSelection ? getSelectedBlockTargets(state.selection) : [];
  const selectedPositions = new Set(selectedTargets.map(({ pos }) => pos));
  const selectableTargets = getSelectableBlockTargets(state.doc);
  const selectablePositions = new Set(selectableTargets.map(({ pos }) => pos));
  const decorations: Decoration[] = [];

  for (const { node, pos } of selectableTargets) {
    const selected = selectedPositions.has(pos);
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: selected
          ? "leafdown-selectable-block leafdown-selected-block"
          : "leafdown-selectable-block",
        "data-leafdown-block-pos": String(pos),
      }),
    );
  }

  for (const { node, pos } of selectedTargets) {
    if (!selectablePositions.has(pos)) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "leafdown-selected-block",
        }),
      );
    }
  }

  return DecorationSet.create(state.doc, decorations);
};

const getOverlayOwner = (view: EditorView) =>
  view.root.nodeType === Node.DOCUMENT_NODE ? (view.root as Document).body : view.root;

const getHandle = (event: Event) =>
  event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>(BLOCK_HANDLE_SELECTOR)
    : null;

const readHandlePosition = (handle: HTMLButtonElement) => {
  const pos = Number(handle.dataset.leafdownBlockPos);
  return Number.isSafeInteger(pos) ? pos : null;
};

const selectionContainsPosition = (selection: BlockSelection, pos: number) =>
  getSelectedBlockTargets(selection).some((target) => target.pos === pos);

const createGutter = (doc: Document, node: ProseMirrorNode, pos: number) => {
  const gutter = doc.createElement("div");
  gutter.className = "leafdown-block-gutter";
  gutter.dataset.leafdownBlockPos = String(pos);

  const markerSlot = doc.createElement("span");
  markerSlot.className = "leafdown-block-gutter__marker-slot";
  markerSlot.setAttribute("aria-hidden", "true");

  const insertionSlot = doc.createElement("span");
  insertionSlot.className = "leafdown-block-gutter__insertion-slot";
  insertionSlot.setAttribute("aria-hidden", "true");

  const handle = doc.createElement("button");
  const blockName = getBlockName(node);
  handle.className = "leafdown-block-handle";
  handle.dataset.leafdownBlockHandle = "";
  handle.dataset.leafdownBlockPos = String(pos);
  handle.tabIndex = -1;
  handle.type = "button";
  handle.setAttribute("aria-label", `Select ${blockName.toLocaleLowerCase()} block`);
  handle.title = `Select ${blockName.toLocaleLowerCase()} block`;

  gutter.append(markerSlot, insertionSlot, handle);
  return gutter;
};

class BlockSelectionView {
  private readonly overlay: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private gutters = new Map<number, HTMLDivElement>();
  private animationFrame: number | null = null;
  private hoveredPos: number | null = null;
  private pendingCollapsePos: number | null = null;
  private pressedHandle: { x: number; y: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private view: EditorView) {
    const doc = view.dom.ownerDocument;
    this.overlay = doc.createElement("div");
    this.overlay.className = "leafdown-block-gutter-layer";

    this.status = doc.createElement("div");
    this.status.className = "leafdown-block-selection-status";
    this.status.setAttribute("aria-live", "polite");
    this.status.setAttribute("role", "status");

    getOverlayOwner(view).append(this.overlay, this.status);
    this.overlay.addEventListener("mousedown", this.handleMouseDown);
    this.overlay.addEventListener("mouseup", this.handleMouseUp);
    this.overlay.addEventListener("mouseover", this.handleHandleMouseOver);
    this.overlay.addEventListener("mouseout", this.handleHandleMouseOut);
    doc.addEventListener("mousemove", this.handleDragMove);
    doc.addEventListener("mouseup", this.handleDocumentMouseUp);
    doc.addEventListener("mouseleave", this.cancelPendingDrag);
    doc.defaultView?.addEventListener("blur", this.cancelPendingDrag);
    view.dom.addEventListener("mousemove", this.handleEditorMouseMove);
    view.dom.addEventListener("mouseleave", this.handleEditorMouseLeave);
    view.root.addEventListener("scroll", this.schedulePosition, true);
    view.dom.ownerDocument.defaultView?.addEventListener("resize", this.schedulePosition);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.schedulePosition);
      this.resizeObserver.observe(view.dom);
    }

    this.rebuild();
    this.updateSelectionPresentation();
  }

  update(view: EditorView, previousState: EditorState) {
    this.view = view;

    if (view.state.doc !== previousState.doc) {
      this.rebuild();
      this.updateSelectionPresentation();
    } else {
      this.schedulePosition();

      if (!view.state.selection.eq(previousState.selection)) {
        this.updateSelectionPresentation();
      }
    }
  }

  destroy() {
    this.overlay.removeEventListener("mousedown", this.handleMouseDown);
    this.overlay.removeEventListener("mouseup", this.handleMouseUp);
    this.overlay.removeEventListener("mouseover", this.handleHandleMouseOver);
    this.overlay.removeEventListener("mouseout", this.handleHandleMouseOut);
    this.view.dom.ownerDocument.removeEventListener("mousemove", this.handleDragMove);
    this.view.dom.ownerDocument.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.view.dom.ownerDocument.removeEventListener("mouseleave", this.cancelPendingDrag);
    this.view.dom.ownerDocument.defaultView?.removeEventListener("blur", this.cancelPendingDrag);
    this.view.dom.removeEventListener("mousemove", this.handleEditorMouseMove);
    this.view.dom.removeEventListener("mouseleave", this.handleEditorMouseLeave);
    this.view.root.removeEventListener("scroll", this.schedulePosition, true);
    this.view.dom.ownerDocument.defaultView?.removeEventListener("resize", this.schedulePosition);
    this.resizeObserver?.disconnect();

    if (this.animationFrame !== null) {
      this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.animationFrame);
    }

    this.cancelPendingDrag();
    this.overlay.remove();
    this.status.remove();
  }

  private rebuild() {
    this.overlay.replaceChildren();
    this.gutters = new Map();

    for (const { node, pos } of getSelectableBlockTargets(this.view.state.doc)) {
      const gutter = createGutter(this.view.dom.ownerDocument, node, pos);

      if (pos === this.hoveredPos) {
        gutter.setAttribute("data-hovered", "");
      }

      this.gutters.set(pos, gutter);
      this.overlay.append(gutter);
    }

    if (this.hoveredPos !== null && !this.gutters.has(this.hoveredPos)) {
      this.hoveredPos = null;
    }

    this.position();
  }

  private readonly schedulePosition = () => {
    const frame = this.view.dom.ownerDocument.defaultView?.requestAnimationFrame;

    if (!frame || this.animationFrame !== null) {
      return;
    }

    this.animationFrame = frame(() => {
      this.animationFrame = null;
      this.position();
    });
  };

  private position() {
    for (const [pos, gutter] of this.gutters) {
      const node = this.view.nodeDOM(pos);

      if (!(node instanceof Element)) {
        gutter.hidden = true;
        continue;
      }

      const rect = node.getBoundingClientRect();
      const lineHeight = Number.parseFloat(
        this.view.dom.ownerDocument.defaultView?.getComputedStyle(node).lineHeight ?? "",
      );
      const blockHeight = Math.max(rect.height, 1);
      const firstLineHeight = Number.isFinite(lineHeight)
        ? Math.min(blockHeight, lineHeight)
        : Math.min(blockHeight, 28);

      gutter.hidden = false;
      gutter.style.left = `${String(rect.left)}px`;
      gutter.style.top = `${String(rect.top)}px`;
      gutter.style.height = `${String(blockHeight)}px`;
      gutter.style.setProperty(
        "--leafdown-block-first-line",
        `${String(Math.max(firstLineHeight, 1))}px`,
      );
    }
  }

  private setHoveredPosition(pos: number | null) {
    if (pos === this.hoveredPos) {
      return;
    }

    if (this.hoveredPos !== null) {
      this.gutters.get(this.hoveredPos)?.removeAttribute("data-hovered");
    }

    this.hoveredPos = pos;

    if (pos !== null) {
      this.gutters.get(pos)?.setAttribute("data-hovered", "");
    }
  }

  private readonly handleEditorMouseMove = (event: MouseEvent) => {
    const block =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-leafdown-block-pos]")
        : null;
    const pos = block ? Number(block.dataset.leafdownBlockPos) : Number.NaN;

    this.setHoveredPosition(Number.isSafeInteger(pos) ? pos : null);
  };

  private readonly handleEditorMouseLeave = () => {
    this.setHoveredPosition(null);
  };

  private readonly handleHandleMouseOver = (event: MouseEvent) => {
    const handle = getHandle(event);
    const pos = handle ? readHandlePosition(handle) : null;

    if (pos !== null) {
      this.gutters.get(pos)?.setAttribute("data-handle-hovered", "");
    }
  };

  private readonly handleHandleMouseOut = (event: MouseEvent) => {
    const handle = getHandle(event);
    const pos = handle ? readHandlePosition(handle) : null;

    if (
      pos !== null &&
      !(event.relatedTarget instanceof Node && handle?.contains(event.relatedTarget))
    ) {
      this.gutters.get(pos)?.removeAttribute("data-handle-hovered");
    }
  };

  private updateSelectionPresentation() {
    for (const gutter of this.gutters.values()) {
      gutter.removeAttribute("data-selected");
    }

    const { selection } = this.view.state;

    if (!isStructuralBlockSelection(this.view.state)) {
      this.status.textContent = "";
      return;
    }

    if (!(selection instanceof BlockSelection)) {
      this.status.textContent = "Document selected";
      return;
    }

    const targets = getSelectedBlockTargets(selection);

    for (const { pos } of targets) {
      this.gutters.get(pos)?.setAttribute("data-selected", "");
    }

    this.status.textContent =
      targets.length === 1
        ? `${getBlockName(targets[0].node)} selected`
        : `${String(targets.length)} blocks selected`;
  }

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) {
      return;
    }

    const handle = getHandle(event);
    const pos = handle ? readHandlePosition(handle) : null;

    if (pos === null) {
      return;
    }

    event.preventDefault();
    this.pressedHandle = { x: event.clientX, y: event.clientY };
    const { selection } = this.view.state;
    let nextSelection: BlockSelection;

    if (event.shiftKey && selection instanceof BlockSelection) {
      nextSelection = createHierarchicalBlockSelection(
        this.view.state.doc,
        selection.$anchorBlock.pos,
        pos,
      );
    } else if (selection instanceof BlockSelection && selectionContainsPosition(selection, pos)) {
      nextSelection = selection;
      this.pendingCollapsePos = pos;
    } else {
      nextSelection = createHierarchicalBlockSelection(this.view.state.doc, pos);
    }

    if (!nextSelection.eq(selection)) {
      this.view.dispatch(this.view.state.tr.setSelection(nextSelection));
    }

    this.view.focus();
  };

  private readonly handleMouseUp = (event: MouseEvent) => {
    if (event.button !== 0 || this.pendingCollapsePos === null) {
      return;
    }

    const pos = this.pendingCollapsePos;
    this.pendingCollapsePos = null;

    if (!this.view.dom.hasAttribute("data-leafdown-block-dragging")) {
      this.view.dispatch(
        this.view.state.tr.setSelection(createHierarchicalBlockSelection(this.view.state.doc, pos)),
      );
    }
  };

  private getDropBoundary(event: MouseEvent) {
    const block =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-leafdown-block-pos]")
        : null;
    const pos = block ? Number(block.dataset.leafdownBlockPos) : Number.NaN;
    if (!Number.isSafeInteger(pos)) return null;

    const target = getSelectableBlockTargets(this.view.state.doc).find((item) => item.pos === pos);
    if (!target) return null;

    const { top, height } = block!.getBoundingClientRect();
    return event.clientY >= top + height / 2 ? pos + target.node.nodeSize : pos;
  }

  private readonly handleDragMove = (event: MouseEvent) => {
    const press = this.pressedHandle;
    if (!press || (event.buttons & 1) === 0) return;
    if (
      !this.view.dom.hasAttribute("data-leafdown-block-dragging") &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >= BLOCK_DRAG_THRESHOLD
    ) {
      this.pendingCollapsePos = null;
      this.view.dom.setAttribute("data-leafdown-block-dragging", "");
    }
  };

  private readonly handleDocumentMouseUp = (event: MouseEvent) => {
    if (!this.pressedHandle || event.button !== 0) return;
    this.pressedHandle = null;
    if (this.view.dom.hasAttribute("data-leafdown-block-dragging")) {
      const boundary = this.getDropBoundary(event);
      if (boundary !== null && canMoveSelectedBlocksToBoundary(this.view.state, boundary)) {
        moveSelectedBlocksToBoundary(this.view, boundary);
      }
    }
    this.cancelPendingDrag();
  };

  private readonly cancelPendingDrag = () => {
    this.pressedHandle = null;
    this.pendingCollapsePos = null;
    this.view.dom.removeAttribute("data-leafdown-block-dragging");
  };
}

export const createLeafdownBlockSelectionPlugin = () =>
  $prose(
    () =>
      new Plugin({
        key: leafdownBlockSelectionPluginKey,
        props: {
          decorations: (state) => getSelectionDecorations(state),
        },
        view: (view) => new BlockSelectionView(view),
      }),
  );
