// @vitest-environment happy-dom

import { CellSelection } from "@milkdown/kit/prose/tables";
import { describe, expect, it, vi } from "vitest";

import {
  createClipboardData,
  dispatchDOMEvent,
  dispatchMouseEvent,
  dispatchMouseDown,
  dispatchMouseUp,
} from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { selectTableCellRange } from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";

import {
  BlockSelection,
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
  getSelectedBlockTargets,
} from "./blockSelection";

const mountEditor = setupMilkdownEditorMount();

const getHandles = () => [
  ...document.querySelectorAll<HTMLButtonElement>("[data-leafdown-block-handle]"),
];

const getHandle = (pos: number) => {
  const handle = document.querySelector<HTMLButtonElement>(
    `[data-leafdown-block-handle][data-leafdown-block-pos="${String(pos)}"]`,
  );

  if (!handle) throw new Error(`Expected a block handle at ${String(pos)}.`);
  return handle;
};

const settleAnimationFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const createRect = (left: number, top: number, height = 28): DOMRect => ({
  bottom: top + height,
  height,
  left,
  right: left + 200,
  top,
  width: 200,
  x: left,
  y: top,
  toJSON: () => ({}),
});

describe("block selection interaction", () => {
  it("renders local non-tabbable handle, insertion, and marker slots for nested blocks", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n\n> Quote\n");
    const targets = getSelectableBlockTargets(mounted.view.state.doc);

    expect(getHandles()).toHaveLength(targets.length);
    expect(getHandles().every((handle) => handle.tabIndex === -1)).toBe(true);
    expect(document.querySelectorAll(".leafdown-block-gutter__insertion-slot")).toHaveLength(
      targets.length,
    );
    expect(document.querySelectorAll(".leafdown-block-gutter__marker-slot")).toHaveLength(
      targets.length,
    );
  });

  it("positions nested handles at each block's rendered logical start", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n");
    const listItems = getSelectableBlockTargets(mounted.view.state.doc).filter(
      ({ node }) => node.type.name === "list_item",
    );

    listItems.forEach(({ pos }, index) => {
      const node = mounted.view.nodeDOM(pos);
      if (!(node instanceof Element)) throw new Error("Expected a rendered list item.");
      vi.spyOn(node, "getBoundingClientRect").mockReturnValue(
        createRect(120 + index * 24, 40, index === 0 ? 84 : 28),
      );
    });

    dispatchDOMEvent(window, "resize");
    await settleAnimationFrame();

    expect(listItems.map(({ pos }) => getHandle(pos).parentElement?.style.left)).toEqual([
      "120px",
      "144px",
      "168px",
    ]);
    expect(listItems.map(({ pos }) => getHandle(pos).parentElement?.style.height)).toEqual([
      "84px",
      "28px",
      "28px",
    ]);
    expect(
      getHandle(listItems[0].pos).parentElement?.style.getPropertyValue(
        "--leafdown-block-first-line",
      ),
    ).toBe("28px");
  });

  it("reveals only the handle for the hovered block", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    const paragraphs = getSelectableBlockTargets(mounted.view.state.doc);
    const firstBlock = mounted.view.nodeDOM(paragraphs[0].pos);
    const secondBlock = mounted.view.nodeDOM(paragraphs[1].pos);

    if (!(firstBlock instanceof Element) || !(secondBlock instanceof Element)) {
      throw new Error("Expected rendered paragraph blocks.");
    }

    dispatchMouseEvent(firstBlock, "mousemove");
    expect(getHandle(paragraphs[0].pos).parentElement).toHaveAttribute("data-hovered");
    expect(getHandle(paragraphs[1].pos).parentElement).not.toHaveAttribute("data-hovered");

    dispatchMouseEvent(secondBlock, "mousemove");
    expect(getHandle(paragraphs[0].pos).parentElement).not.toHaveAttribute("data-hovered");
    expect(getHandle(paragraphs[1].pos).parentElement).toHaveAttribute("data-hovered");

    dispatchMouseEvent(mounted.view.dom, "mouseleave");
    expect(document.querySelector(".leafdown-block-gutter[data-hovered]")).toBeNull();

    const firstHandle = getHandle(paragraphs[0].pos);
    dispatchMouseEvent(firstHandle, "mouseover");
    expect(firstHandle.parentElement).toHaveAttribute("data-handle-hovered");

    dispatchMouseEvent(firstHandle, "mouseout", { relatedTarget: document.body });
    expect(firstHandle.parentElement).not.toHaveAttribute("data-handle-hovered");
  });

  it("selects on handle press, keeps editor focus, decorates the block, and opens the popup on release", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor("First\n\nSecond\n", { onContextPopupRequested });
    const first = getSelectableBlockTargets(mounted.view.state.doc)[0];
    const handle = getHandle(first.pos);

    dispatchMouseDown(handle, { button: 0 });

    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
    expect(document.activeElement).toBe(mounted.view.dom);
    expect(mounted.view.nodeDOM(first.pos)).toHaveClass("leafdown-selected-block");
    expect(onContextPopupRequested).not.toHaveBeenCalled();

    dispatchMouseUp(handle, { button: 0 });

    await waitFor(() => {
      expect(onContextPopupRequested).toHaveBeenCalledWith(
        expect.objectContaining({ selectionKind: "block", source: "pointer" }),
      );
    });
  });

  it("extends, reverses, and collapses a block range through handle gestures", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    const paragraphs = getSelectableBlockTargets(mounted.view.state.doc);

    dispatchMouseDown(getHandle(paragraphs[2].pos), { button: 0 });
    dispatchMouseUp(getHandle(paragraphs[2].pos), { button: 0 });
    dispatchMouseDown(getHandle(paragraphs[0].pos), { button: 0, shift: true });

    const reversed = mounted.view.state.selection as BlockSelection;
    expect(reversed.$anchorBlock.pos).toBe(paragraphs[2].pos);
    expect(reversed.$headBlock.pos).toBe(paragraphs[0].pos);
    expect(reversed.content().content.childCount).toBe(3);

    dispatchMouseDown(getHandle(paragraphs[1].pos), { button: 0 });
    expect((mounted.view.state.selection as BlockSelection).content().content.childCount).toBe(3);
    dispatchMouseUp(getHandle(paragraphs[1].pos), { button: 0 });

    const collapsed = mounted.view.state.selection as BlockSelection;
    expect(collapsed.$anchorBlock.pos).toBe(paragraphs[1].pos);
    expect(collapsed.$headBlock.pos).toBe(paragraphs[1].pos);
  });

  it("keeps exact list-item endpoints when a handle range crosses list wrappers", async () => {
    const mounted = await mountEditor(`- Hyphen item
- Second hyphen item

+ Plus item starts another list

* Asterisk item starts another list
`);
    const listItems = getSelectableBlockTargets(mounted.view.state.doc).filter(
      ({ node }) => node.type.name === "list_item",
    );

    dispatchMouseDown(getHandle(listItems[1].pos), { button: 0 });
    dispatchMouseUp(getHandle(listItems[1].pos), { button: 0 });
    dispatchMouseDown(getHandle(listItems[2].pos), { button: 0, shift: true });

    const selection = mounted.view.state.selection as BlockSelection;
    expect(getSelectedBlockTargets(selection).map(({ node }) => node.textContent)).toEqual([
      "Second hyphen item",
      "Plus item starts another list",
    ]);
    expect(document.querySelectorAll("li.leafdown-selected-block")).toHaveLength(2);
    expect(mounted.view.nodeDOM(listItems[0].pos)).not.toHaveClass("leafdown-selected-block");
    expect(mounted.view.nodeDOM(listItems[3].pos)).not.toHaveClass("leafdown-selected-block");
  });

  it("prepares the selected range for dragging without opening the popup", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor("First\n\nSecond\n", { onContextPopupRequested });
    const paragraphs = getSelectableBlockTargets(mounted.view.state.doc);
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      paragraphs[0].pos,
      paragraphs[1].pos,
    );
    mounted.view.dispatch(mounted.view.state.tr.setSelection(selection));
    onContextPopupRequested.mockClear();

    const handle = getHandle(paragraphs[0].pos);
    dispatchMouseDown(handle, { button: 0 });
    const dataTransfer = createClipboardData();
    const dragStart = new Event("dragstart", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    handle.dispatchEvent(dragStart);
    dispatchMouseUp(document.body, { button: 0 });
    handle.dispatchEvent(new Event("dragend", { bubbles: true }));

    await settleAnimationFrame();

    expect(dataTransfer.types).toContain("application/x-leafdown-block-selection");
    expect(mounted.view.dom).not.toHaveAttribute("data-leafdown-block-dragging");
    expect(onContextPopupRequested).not.toHaveBeenCalled();
  });

  it("announces block type or count without adding a tab stop", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    const paragraphs = getSelectableBlockTargets(mounted.view.state.doc);

    dispatchMouseDown(getHandle(paragraphs[0].pos), { button: 0 });
    expect(document.querySelector("[role='status']")).toHaveTextContent("Paragraph selected");

    dispatchMouseDown(getHandle(paragraphs[1].pos), { button: 0, shift: true });
    expect(document.querySelector("[role='status']")).toHaveTextContent("2 blocks selected");
    expect(getHandles().every((handle) => handle.tabIndex === -1)).toBe(true);
  });

  it("retains selected-handle presentation when a document change preserves the range", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    const first = getSelectableBlockTargets(mounted.view.state.doc)[0];
    const selection = createHierarchicalBlockSelection(mounted.view.state.doc, first.pos);
    mounted.view.dispatch(mounted.view.state.tr.setSelection(selection));

    mounted.view.dispatch(mounted.view.state.tr.insertText("Edited ", first.pos + 1));

    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
    expect(getHandle(first.pos).parentElement).toHaveAttribute("data-selected");
  });

  it("keeps table cells under native CellSelection while exposing one atomic table handle", async () => {
    const mounted = await mountEditor("| A | B |\n| - | - |\n| C | D |\n");
    selectTableCellRange(mounted, { row: 0, col: 0 }, { row: 1, col: 1 });

    expect(mounted.view.state.selection).toBeInstanceOf(CellSelection);
    expect(getHandles()).toHaveLength(1);
    expect(getHandles()[0]).toHaveAccessibleName("Select table block");
  });
});
