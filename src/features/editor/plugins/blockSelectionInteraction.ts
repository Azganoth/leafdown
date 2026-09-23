import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { canInsertBlockAtBoundary, type BoundaryInsertKind } from "../commands/inserting/blocks";
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
const BOUNDARY_INSERT_KINDS: readonly BoundaryInsertKind[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "image",
  "blockquote",
  "unorderedList",
  "orderedList",
  "taskList",
  "codeBlock",
  "table",
  "horizontalRule",
  "listItem",
];

export interface BlockInsertionRequest {
  boundary: number;
  document: ProseMirrorNode;
  kinds: readonly BoundaryInsertKind[];
  source: "pointer" | "keyboard";
  anchor: Element;
  onDismiss: () => void;
}

export interface BlockInsertionOptions {
  onRequest?: (request: BlockInsertionRequest) => void;
}

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
  private readonly insertionButton: HTMLButtonElement;
  private readonly insertionIndicator: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private gutters = new Map<number, HTMLDivElement>();
  private targets = new Map<number, ProseMirrorNode>();
  private geometry = new Map<
    number,
    { gutter: DOMRect; block: DOMRect; interactiveLeft: number; interactiveRight: number }
  >();
  private animationFrame: number | null = null;
  private hoveredPos: number | null = null;
  private pendingCollapsePos: number | null = null;
  private pressedHandle: { x: number; y: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private insertionTarget: {
    pos: number;
    boundary: number;
    kinds: readonly BoundaryInsertKind[];
  } | null = null;
  private insertionMenuOpen = false;

  constructor(
    private view: EditorView,
    private readonly insertion: BlockInsertionOptions,
  ) {
    const doc = view.dom.ownerDocument;
    this.overlay = doc.createElement("div");
    this.overlay.className = "leafdown-block-gutter-layer";

    this.insertionIndicator = doc.createElement("div");
    this.insertionIndicator.className = "leafdown-block-insertion-indicator";
    this.insertionIndicator.hidden = true;
    this.insertionButton = doc.createElement("button");
    this.insertionButton.className = "leafdown-block-insertion-button";
    this.insertionButton.type = "button";
    this.insertionButton.tabIndex = -1;
    this.insertionButton.hidden = true;
    this.insertionButton.dataset.leafdownBlockInsert = "";
    this.insertionButton.setAttribute("aria-label", "Insert block at indicated boundary");
    this.insertionButton.title = "Insert block";
    const plusIcon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    plusIcon.setAttribute("viewBox", "0 0 24 24");
    plusIcon.setAttribute("aria-hidden", "true");
    const plusPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    plusPath.setAttribute("d", "M12 5v14m-7-7h14");
    plusIcon.append(plusPath);
    this.insertionButton.append(plusIcon);
    this.overlay.append(this.insertionIndicator, this.insertionButton);

    this.status = doc.createElement("div");
    this.status.className = "leafdown-block-selection-status";
    this.status.setAttribute("aria-live", "polite");
    this.status.setAttribute("role", "status");

    getOverlayOwner(view).append(this.overlay, this.status);
    this.overlay.addEventListener("mousedown", this.handleMouseDown);
    this.overlay.addEventListener("mouseup", this.handleMouseUp);
    this.overlay.addEventListener("mouseover", this.handleHandleMouseOver);
    this.overlay.addEventListener("mouseout", this.handleHandleMouseOut);
    this.insertionButton.addEventListener("mouseenter", this.showInsertionIndicator);
    this.insertionButton.addEventListener("mouseleave", this.hideInsertionIndicator);
    this.insertionButton.addEventListener("mousedown", this.preventInsertionMouseDown);
    this.insertionButton.addEventListener("click", this.openInsertionMenu);
    doc.addEventListener("mousemove", this.handleDragMove);
    doc.addEventListener("mousemove", this.handleInsertionMouseMove);
    doc.addEventListener("mouseup", this.handleDocumentMouseUp);
    doc.addEventListener("mouseleave", this.cancelPendingDrag);
    doc.addEventListener("mouseleave", this.handleInsertionLeave);
    doc.defaultView?.addEventListener("blur", this.cancelPendingDrag);
    doc.defaultView?.addEventListener("blur", this.handleInsertionLeave);
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
    this.insertionButton.removeEventListener("mouseenter", this.showInsertionIndicator);
    this.insertionButton.removeEventListener("mouseleave", this.hideInsertionIndicator);
    this.insertionButton.removeEventListener("mousedown", this.preventInsertionMouseDown);
    this.insertionButton.removeEventListener("click", this.openInsertionMenu);
    this.view.dom.ownerDocument.removeEventListener("mousemove", this.handleDragMove);
    this.view.dom.ownerDocument.removeEventListener("mousemove", this.handleInsertionMouseMove);
    this.view.dom.ownerDocument.removeEventListener("mouseup", this.handleDocumentMouseUp);
    this.view.dom.ownerDocument.removeEventListener("mouseleave", this.cancelPendingDrag);
    this.view.dom.ownerDocument.removeEventListener("mouseleave", this.handleInsertionLeave);
    this.view.dom.ownerDocument.defaultView?.removeEventListener("blur", this.cancelPendingDrag);
    this.view.dom.ownerDocument.defaultView?.removeEventListener("blur", this.handleInsertionLeave);
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
    this.overlay.replaceChildren(this.insertionIndicator, this.insertionButton);
    this.gutters = new Map();
    this.targets = new Map();

    for (const { node, pos } of getSelectableBlockTargets(this.view.state.doc)) {
      const gutter = createGutter(this.view.dom.ownerDocument, node, pos);

      if (pos === this.hoveredPos) {
        gutter.setAttribute("data-hovered", "");
      }

      this.gutters.set(pos, gutter);
      this.targets.set(pos, node);
      this.overlay.append(gutter);
    }

    if (this.hoveredPos !== null && !this.gutters.has(this.hoveredPos)) {
      this.hoveredPos = null;
    }

    this.position();
  }

  private readonly schedulePosition = () => {
    if (!this.insertionMenuOpen) this.clearInsertionTarget();
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
    const previousBlock = this.insertionTarget
      ? this.geometry.get(this.insertionTarget.pos)?.block
      : null;
    this.geometry.clear();
    const visibleBlocks = new Map<number, DOMRect>();
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
      const direction = this.view.dom.ownerDocument.defaultView?.getComputedStyle(node).direction;
      gutter.toggleAttribute("data-rtl", direction === "rtl");
      gutter.style.left = `${String(direction === "rtl" ? rect.right : rect.left)}px`;
      gutter.style.top = `${String(rect.top)}px`;
      gutter.style.height = `${String(blockHeight)}px`;
      gutter.style.setProperty(
        "--leafdown-block-first-line",
        `${String(Math.max(firstLineHeight, 1))}px`,
      );
      visibleBlocks.set(pos, rect);
    }
    for (const [pos, rect] of visibleBlocks) {
      const gutter = this.gutters.get(pos)!;
      const gutterRect = gutter.getBoundingClientRect();
      const markerRect = gutter.firstElementChild?.getBoundingClientRect();
      const isRtl = gutter.hasAttribute("data-rtl");
      this.geometry.set(pos, {
        gutter: gutterRect,
        block: rect,
        interactiveLeft: markerRect?.width
          ? isRtl
            ? gutterRect.left
            : markerRect.right
          : gutterRect.left,
        interactiveRight: markerRect?.width
          ? isRtl
            ? markerRect.left
            : gutterRect.right
          : gutterRect.right,
      });
    }
    if (this.insertionTarget && !this.gutters.has(this.insertionTarget.pos)) {
      this.clearInsertionTarget();
    } else if (this.insertionMenuOpen && this.insertionTarget) {
      const { pos, boundary } = this.insertionTarget;
      const before = previousBlock;
      const after = this.geometry.get(pos)?.block;
      if (before && after) {
        this.setInsertionTarget(
          pos,
          boundary,
          Number.parseFloat(this.insertionButton.style.top) + after.top - before.top,
        );
        this.insertionIndicator.hidden = false;
      }
    }
  }

  private clearInsertionTarget() {
    this.insertionTarget = null;
    this.insertionButton.hidden = true;
    this.insertionIndicator.hidden = true;
  }

  private getSiblingBoundaryGeometry(boundary: number) {
    const $boundary = this.view.state.doc.resolve(boundary);
    const before = $boundary.nodeBefore;
    const after = $boundary.nodeAfter;
    const beforePos = before ? boundary - before.nodeSize : null;
    const beforeGeometry =
      beforePos !== null && this.targets.get(beforePos) === before
        ? this.geometry.get(beforePos)
        : undefined;
    const afterGeometry =
      after && this.targets.get(boundary) === after ? this.geometry.get(boundary) : undefined;
    return { beforeGeometry, afterGeometry };
  }

  private setInsertionTarget(pos: number, boundary: number, y: number, pointerX?: number) {
    const gutter = this.gutters.get(pos);
    const geometry = this.geometry.get(pos);
    if (!gutter || !geometry) return this.clearInsertionTarget();
    const kinds =
      this.insertionTarget?.pos === pos && this.insertionTarget.boundary === boundary
        ? this.insertionTarget.kinds
        : BOUNDARY_INSERT_KINDS.filter((kind) =>
            canInsertBlockAtBoundary(this.view.state, boundary, kind),
          );
    if (kinds.length === 0) return this.clearInsertionTarget();
    this.insertionTarget = { pos, boundary, kinds };
    const slot = gutter.querySelector(".leafdown-block-gutter__insertion-slot");
    const slotRect = slot?.getBoundingClientRect();
    const { gutter: gutterRect, block: nodeRect } = geometry;
    const x =
      slotRect && slotRect.width > 0
        ? slotRect.left + slotRect.width / 2
        : gutterRect.left + gutterRect.width / 2;
    this.insertionButton.style.left = `${String(x)}px`;
    this.insertionButton.style.top = `${String(y)}px`;
    this.insertionButton.hidden = false;
    this.insertionIndicator.hidden = pointerX === undefined || Math.abs(pointerX - x) > 12;
    const { beforeGeometry, afterGeometry } = this.getSiblingBoundaryGeometry(boundary);
    const beforeRect = beforeGeometry?.block;
    const afterRect = afterGeometry?.block;
    const indicatorRect = afterRect ?? beforeRect ?? nodeRect;
    const indicatorY =
      beforeRect && afterRect
        ? (beforeRect.bottom + afterRect.top) / 2
        : boundary === pos
          ? nodeRect.top
          : nodeRect.bottom;
    this.insertionIndicator.style.left = `${String(indicatorRect.left)}px`;
    this.insertionIndicator.style.top = `${String(indicatorY)}px`;
    this.insertionIndicator.style.width = `${String(indicatorRect.width)}px`;
  }

  private readonly handleInsertionMouseMove = (event: MouseEvent) => {
    if (this.insertionMenuOpen || this.pressedHandle) return;
    const candidates = [...this.geometry.entries()].flatMap(
      ([pos, { gutter: rect, block: nodeRect, interactiveLeft, interactiveRight }]) => {
        if (
          event.clientY < rect.top ||
          event.clientY > rect.bottom ||
          event.clientX < interactiveLeft ||
          event.clientX > interactiveRight
        )
          return [];
        const center = rect.left + rect.width / 2;
        return [{ pos, nodeRect, distance: Math.abs(event.clientX - center) }];
      },
    );
    candidates.sort((a, b) => a.distance - b.distance || b.pos - a.pos);
    const candidate = candidates[0];
    if (!candidate) {
      const gaps = [...this.targets.entries()].flatMap(([pos, node]) => {
        const boundary = pos + node.nodeSize;
        const beforeGeometry = this.geometry.get(pos);
        const afterGeometry = this.geometry.get(boundary);
        if (!beforeGeometry || !afterGeometry) return [];
        const beforeRect = beforeGeometry.block;
        const afterRect = afterGeometry.block;
        if (event.clientY <= beforeRect.bottom || event.clientY >= afterRect.top) return [];
        const gutters = [beforeGeometry, afterGeometry].filter(
          ({ interactiveLeft, interactiveRight }) =>
            event.clientX >= interactiveLeft && event.clientX <= interactiveRight,
        );
        if (gutters.length === 0) return [];
        const siblings = this.getSiblingBoundaryGeometry(boundary);
        if (siblings.beforeGeometry !== beforeGeometry || siblings.afterGeometry !== afterGeometry)
          return [];
        const distance = Math.min(
          ...gutters.map(({ gutter }) =>
            Math.abs(event.clientX - (gutter.left + gutter.width / 2)),
          ),
        );
        return [{ pos, boundary, distance }];
      });
      gaps.sort((a, b) => a.distance - b.distance || b.pos - a.pos);
      const gap = gaps[0];
      if (!gap) return this.clearInsertionTarget();
      return this.setInsertionTarget(gap.pos, gap.boundary, event.clientY, event.clientX);
    }
    const node = this.targets.get(candidate.pos);
    if (!node) return this.clearInsertionTarget();
    const boundary =
      event.clientY < candidate.nodeRect.top + candidate.nodeRect.height / 2
        ? candidate.pos
        : candidate.pos + node.nodeSize;
    this.setInsertionTarget(candidate.pos, boundary, event.clientY, event.clientX);
  };

  private readonly showInsertionIndicator = () => {
    if (this.insertionTarget) this.insertionIndicator.hidden = false;
  };

  private readonly hideInsertionIndicator = () => {
    if (!this.insertionMenuOpen) this.insertionIndicator.hidden = true;
  };

  private readonly handleInsertionLeave = () => {
    if (!this.insertionMenuOpen) this.clearInsertionTarget();
  };

  private readonly preventInsertionMouseDown = (event: MouseEvent) => event.preventDefault();

  private readonly openInsertionMenu = () => {
    const target = this.insertionTarget;
    if (!target || !this.insertion.onRequest) return;
    this.insertionMenuOpen = true;
    this.insertionIndicator.hidden = false;
    this.insertion.onRequest({
      boundary: target.boundary,
      document: this.view.state.doc,
      kinds: target.kinds,
      source: "pointer",
      anchor: this.insertionButton,
      onDismiss: this.dismissInsertionMenu,
    });
  };

  private readonly dismissInsertionMenu = () => {
    this.insertionMenuOpen = false;
    this.clearInsertionTarget();
  };

  openInsertionMenuFromKeyboard() {
    if (!this.insertion.onRequest) return false;
    const { selection, doc } = this.view.state;
    const pos = selection instanceof BlockSelection ? selection.$headBlock.pos : selection.head;
    const target = getSelectableBlockTargets(doc)
      .filter(({ node, pos: start }) => start <= pos && pos <= start + node.nodeSize)
      .at(-1);
    if (!target) return false;
    this.position();
    const node = this.view.nodeDOM(target.pos);
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    this.setInsertionTarget(target.pos, target.pos + target.node.nodeSize, rect.bottom);
    if (!this.insertionTarget) return false;
    this.insertionMenuOpen = true;
    this.insertionIndicator.hidden = false;
    this.insertion.onRequest({
      boundary: this.insertionTarget.boundary,
      document: this.view.state.doc,
      kinds: this.insertionTarget.kinds,
      source: "keyboard",
      anchor: this.insertionButton,
      onDismiss: this.dismissInsertionMenu,
    });
    return true;
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

export const createLeafdownBlockSelectionPlugin = (insertion: BlockInsertionOptions = {}) =>
  $prose(() => {
    let presentation: BlockSelectionView | null = null;
    return new Plugin({
      key: leafdownBlockSelectionPluginKey,
      props: {
        decorations: (state) => getSelectionDecorations(state),
        handleKeyDown: (_view, event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.altKey &&
            !event.shiftKey &&
            event.key.toLowerCase() === "i"
          ) {
            return presentation?.openInsertionMenuFromKeyboard() ?? false;
          }
          return false;
        },
      },
      view: (view) => {
        presentation = new BlockSelectionView(view, insertion);
        return presentation;
      },
    });
  });
