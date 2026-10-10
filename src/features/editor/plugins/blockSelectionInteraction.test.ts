// @vitest-environment happy-dom

import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection } from "@milkdown/kit/prose/tables";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { createLocalization, localizer, PSEUDO_LOCALE } from "@/lib/i18n";
import {
  dispatchDOMEvent,
  dispatchMouseEvent,
  dispatchMouseDown,
  dispatchMouseUp,
  dispatchKeyDown,
  stubElementsFromPoint,
} from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { withWindowsUserAgent } from "@/test/utils/platform";
import { selectTableCellRange, setTextSelection } from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";

import {
  BlockSelection,
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
  getSelectedBlockTargets,
} from "./blockSelection";
import type { BlockInsertionRequest } from "./blockSelectionInteraction";

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

const createRect = (left: number, top: number, height = 28, width = 200): DOMRect => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  top,
  width,
  x: left,
  y: top,
  toJSON: () => ({}),
});

const layOutParagraphGutters = async (mounted: MountedMilkdownEditor) => {
  const paragraphs = getSelectableBlockTargets(mounted.view.state.doc).filter(
    ({ node }) => node.type.name === "paragraph",
  );
  paragraphs.forEach(({ pos }, index) => {
    const node = mounted.view.nodeDOM(pos);
    const gutter = getHandle(pos).parentElement;
    if (!(node instanceof Element) || !gutter) throw new Error("Expected paragraph gutter.");
    const top = index === 0 ? 40 : 88;
    vi.spyOn(node, "getBoundingClientRect").mockReturnValue(createRect(100, top));
    vi.spyOn(gutter, "getBoundingClientRect").mockReturnValue(createRect(50, top, 28, 52));
    vi.spyOn(gutter.firstElementChild!, "getBoundingClientRect").mockReturnValue(
      createRect(50, top, 28, 12),
    );
  });
  dispatchDOMEvent(window, "resize");
  await settleAnimationFrame();
  return {
    button: document.querySelector<HTMLButtonElement>("[data-leafdown-block-insert]")!,
    indicator: document.querySelector<HTMLElement>(".leafdown-block-insertion-indicator")!,
    paragraphs,
  };
};

describe("block selection interaction", () => {
  it.each([
    ["Paragraph text\n", true],
    ["# Heading text\n", true],
    ["Paragraph text\n", false],
  ] as const)(
    "keeps Ctrl-click in ordinary text out of node selection: %s, modifier held on release: %s",
    async (markdown, ctrlOnRelease) => {
      await withWindowsUserAgent(async () => {
        const mounted = await mountEditor(markdown);
        const target = mounted.view.nodeDOM(0) as HTMLElement;
        vi.spyOn(mounted.view, "posAtCoords").mockReturnValue({ pos: 3, inside: 0 });

        dispatchMouseDown(target, { ctrl: true, clientX: 10, clientY: 10 });
        const release = dispatchMouseUp(target, { ctrl: ctrlOnRelease, clientX: 10, clientY: 10 });
        dispatchMouseEvent(target, "click", { ctrl: ctrlOnRelease, clientX: 10, clientY: 10 });

        expect(release.defaultPrevented).toBe(true);
        expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
        expect(mounted.view.state.selection.from).toBe(3);
        expect(mounted.view.hasFocus()).toBe(true);
        expect(mounted.view.dom.querySelector(".ProseMirror-selectednode")).toBeNull();
        expect(mounted.getMarkdown()).toBe(markdown);
      });
    },
  );

  it("preserves native atomic-node selection for Ctrl-click and plain click", async () => {
    await withWindowsUserAgent(async () => {
      const mounted = await mountEditor("---\n\nParagraph\n");
      const target = mounted.view.nodeDOM(0) as HTMLElement;
      vi.spyOn(mounted.view, "posAtCoords").mockReturnValue({ pos: 0, inside: 0 });

      for (const ctrl of [false, true]) {
        mounted.view.dispatch(
          mounted.view.state.tr.setSelection(TextSelection.create(mounted.view.state.doc, 3)),
        );
        dispatchMouseDown(target, { ctrl, clientX: 10, clientY: 10 });
        dispatchMouseUp(target, { ctrl, clientX: 10, clientY: 10 });
        dispatchMouseEvent(target, "click", { ctrl, clientX: 10, clientY: 10 });
        expect(mounted.view.state.selection).toBeInstanceOf(NodeSelection);
        expect((mounted.view.state.selection as NodeSelection).node.type.name).toBe("hr");
      }
    });
  });

  it("keeps one indicator position between adjacent sibling blocks", async () => {
    const onBlockInsertionRequested = vi.fn();
    const mounted = await mountEditor("First\n\nSecond\n", { onBlockInsertionRequested });
    const { button, indicator, paragraphs } = await layOutParagraphGutters(mounted);

    dispatchMouseEvent(document, "mousemove", { clientX: 76, clientY: 60 });
    expect(button.style.top).toBe("60px");
    expect(indicator.style.top).toBe("78px");
    dispatchMouseEvent(document, "mousemove", { clientX: 76, clientY: 78 });
    expect(button).not.toHaveAttribute("hidden");
    expect(button.style.top).toBe("78px");
    expect(indicator.style.top).toBe("78px");
    dispatchMouseEvent(document, "mousemove", { clientX: 76, clientY: 94 });
    expect(button.style.top).toBe("94px");
    expect(indicator.style.top).toBe("78px");
    dispatchMouseEvent(button, "click");
    expect(onBlockInsertionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ boundary: paragraphs[0].pos + paragraphs[0].node.nodeSize }),
    );
  });

  it("leaves the insertion control to a menu covering its gutter until the menu is gone", async () => {
    const onBlockInsertionRequested = vi.fn();
    const mounted = await mountEditor("First\n\nSecond\n", { onBlockInsertionRequested });
    const { button, indicator, paragraphs } = await layOutParagraphGutters(mounted);
    const menu = document.createElement("div");
    document.body.append(menu);
    onTestFinished(() => menu.remove());
    let beneath: Element = mounted.view.dom.parentElement!;
    stubElementsFromPoint(() => [button, beneath, document.body]);

    dispatchMouseEvent(mounted.view.dom, "mousemove", { clientX: 76, clientY: 60 });
    expect(button).not.toHaveAttribute("hidden");

    beneath = menu;
    dispatchMouseEvent(button, "mouseover", { clientX: 76, clientY: 60 });
    expect(button).toHaveAttribute("hidden");
    expect(indicator).toHaveAttribute("hidden");

    dispatchMouseEvent(menu, "mousemove", { clientX: 76, clientY: 94 });
    expect(button).toHaveAttribute("hidden");
    expect(indicator).toHaveAttribute("hidden");

    beneath = mounted.view.dom;
    menu.remove();
    dispatchMouseEvent(mounted.view.dom, "mousemove", { clientX: 76, clientY: 94 });
    expect(button).not.toHaveAttribute("hidden");
    expect(button.style.top).toBe("94px");
    dispatchMouseEvent(button, "click");
    expect(onBlockInsertionRequested).toHaveBeenCalledOnce();
    expect(onBlockInsertionRequested).toHaveBeenCalledWith(
      expect.objectContaining({ boundary: paragraphs[1].pos }),
    );
  });

  it("tracks one insertion button across local depths and paints only the hovered boundary", async () => {
    const onBlockInsertionRequested = vi.fn((_request: BlockInsertionRequest) => {});
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n", {
      onBlockInsertionRequested,
    });
    const items = getSelectableBlockTargets(mounted.view.state.doc).filter(
      ({ node }) => node.type.name === "list_item",
    );
    items.forEach(({ pos }, index) => {
      const node = mounted.view.nodeDOM(pos);
      const gutter = getHandle(pos).parentElement;
      if (!(node instanceof Element) || !gutter) throw new Error("Expected local list gutter.");
      vi.spyOn(node, "getBoundingClientRect").mockReturnValue(
        createRect(100 + index * 24, 40 + index * 28, index === 0 ? 84 : 28),
      );
      vi.spyOn(gutter, "getBoundingClientRect").mockReturnValue(
        createRect(50 + index * 24, 40 + index * 28, index === 0 ? 84 : 28, 52),
      );
      vi.spyOn(gutter.firstElementChild!, "getBoundingClientRect").mockReturnValue(
        createRect(50 + index * 24, 40 + index * 28, index === 0 ? 84 : 28, 12),
      );
    });
    dispatchDOMEvent(window, "resize");
    await settleAnimationFrame();
    const button = document.querySelector<HTMLButtonElement>("[data-leafdown-block-insert]")!;
    const indicator = document.querySelector<HTMLElement>(".leafdown-block-insertion-indicator")!;

    dispatchMouseEvent(document, "mousemove", { clientX: 55, clientY: 72 });
    expect(button).toHaveAttribute("hidden");
    dispatchMouseEvent(document, "mousemove", { clientX: 95, clientY: 50 });
    expect(button).not.toHaveAttribute("hidden");
    expect(indicator).toHaveAttribute("hidden");
    dispatchMouseEvent(document, "mousemove", { clientX: 92, clientY: 90 });
    expect(button.style.top).toBe("90px");
    dispatchMouseEvent(button, "mousemove", { clientX: 92, clientY: 93 });
    expect(button.style.top).toBe("93px");
    expect(button.querySelector("svg path")).toHaveAttribute("d", "M12 5v14m-7-7h14");
    dispatchMouseEvent(button, "mouseenter");
    expect(indicator).not.toHaveAttribute("hidden");
    expect(indicator.style.top).toBe("96px");
    dispatchMouseEvent(button, "click");
    expect(onBlockInsertionRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        boundary: items[1].pos + items[1].node.nodeSize,
        kinds: ["listItem"],
        source: "pointer",
      }),
    );
    expect(mounted.getMarkdown()).toBe("- Parent\n  - First\n  - Second\n");
    onBlockInsertionRequested.mock.lastCall![0].onDismiss();
    expect(button).toHaveAttribute("hidden");
    expect(indicator).toHaveAttribute("hidden");
    dispatchMouseEvent(document, "mousemove", { clientX: 92, clientY: 90 });
    dispatchMouseEvent(document, "mouseleave");
    expect(button).toHaveAttribute("hidden");
  });

  it("opens the same boundary menu from the focused editor without adding a tab stop", async () => {
    const onBlockInsertionRequested = vi.fn();
    const mounted = await mountEditor("First\n\nSecond\n", { onBlockInsertionRequested });
    mounted.view.focus();
    dispatchKeyDown(mounted.view.dom, "i", { ctrl: true, alt: true });
    expect(onBlockInsertionRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "keyboard",
        boundary: getSelectableBlockTargets(mounted.view.state.doc)[0].node.nodeSize,
      }),
    );
    expect(
      document.querySelector<HTMLButtonElement>("[data-leafdown-block-insert]")?.tabIndex,
    ).toBe(-1);
  });
  describe("within a scrolled document view", () => {
    const blockTops = [0, 60, 150, 280, 330];
    const blockHeight = 60;

    const mountScrolled = async (onBlockInsertionRequested = vi.fn()) => {
      const mounted = await mountEditor("Above\n\nFirst\n\nSecond\n\nThird\n\nBelow\n", {
        onBlockInsertionRequested,
      });
      mounted.root.style.overflowY = "auto";
      vi.spyOn(mounted.root, "getBoundingClientRect").mockReturnValue(createRect(0, 100, 200, 400));
      const layer = document.querySelector(".leafdown-block-gutter-layer")!;
      vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(createRect(0, 0, 768, 1024));
      const targets = getSelectableBlockTargets(mounted.view.state.doc);
      const nodeRects = targets.map(({ pos }, index) => {
        const node = mounted.view.nodeDOM(pos);
        if (!(node instanceof Element)) throw new Error("Expected a rendered paragraph.");
        return vi
          .spyOn(node, "getBoundingClientRect")
          .mockReturnValue(createRect(100, blockTops[index], blockHeight));
      });
      const getGutter = (index: number) => getHandle(targets[index].pos).parentElement!;
      dispatchDOMEvent(window, "resize");
      await settleAnimationFrame();
      return { mounted, targets, nodeRects, getGutter, layer };
    };

    it("clips the control layer and fits each gutter to its block's visible part", async () => {
      const { getGutter, layer } = await mountScrolled();

      expect(layer).toHaveStyle({ clipPath: "inset(100px 624px 468px 0px)" });
      expect(getGutter(0)).toHaveAttribute("hidden");
      expect(getGutter(1).style).toMatchObject({ top: "100px", height: "20px" });
      expect(getGutter(1).style.getPropertyValue("--leafdown-block-first-line")).toBe("20px");
      expect(getGutter(2).style).toMatchObject({ top: "150px", height: "60px" });
      expect(getGutter(3).style).toMatchObject({ top: "280px", height: "20px" });
      expect(getGutter(4)).toHaveAttribute("hidden");
    });

    it("tracks insertion only while the pointer is inside the view", async () => {
      const { getGutter } = await mountScrolled();
      const gutter = getGutter(1);
      const laidOut = (width: number) => () =>
        createRect(
          50,
          Number.parseFloat(gutter.style.top),
          Number.parseFloat(gutter.style.height),
          width,
        );
      vi.spyOn(gutter, "getBoundingClientRect").mockImplementation(laidOut(52));
      vi.spyOn(gutter.firstElementChild!, "getBoundingClientRect").mockImplementation(laidOut(12));
      dispatchDOMEvent(window, "resize");
      await settleAnimationFrame();
      const button = document.querySelector<HTMLButtonElement>("[data-leafdown-block-insert]")!;

      dispatchMouseEvent(document, "mousemove", { clientX: 76, clientY: 104 });
      expect(button).not.toHaveAttribute("hidden");
      expect(button.style.top).toBe("104px");
      dispatchMouseEvent(document, "mousemove", { clientX: 76, clientY: 96 });
      expect(button).toHaveAttribute("hidden");
    });

    it("keeps the keyboard insertion anchor inside the view", async () => {
      const onBlockInsertionRequested = vi.fn();
      const { mounted, targets, nodeRects } = await mountScrolled(onBlockInsertionRequested);
      const button = document.querySelector<HTMLButtonElement>("[data-leafdown-block-insert]")!;
      setTextSelection(mounted.view, targets[3].pos + 1);
      mounted.view.focus();

      dispatchKeyDown(mounted.view.dom, "i", { ctrl: true, alt: true });

      expect(onBlockInsertionRequested).toHaveBeenCalledWith(
        expect.objectContaining({ boundary: targets[3].pos + targets[3].node.nodeSize }),
      );
      expect(button.style.top).toBe("300px");

      nodeRects[3].mockReturnValue(createRect(100, 220, blockHeight));
      dispatchDOMEvent(window, "resize");
      await settleAnimationFrame();
      expect(button.style.top).toBe("280px");
    });

    it("scrolls a keyboard insertion target outside the view into it", async () => {
      const onBlockInsertionRequested = vi.fn();
      const { mounted, targets, nodeRects } = await mountScrolled(onBlockInsertionRequested);
      setTextSelection(mounted.view, targets[4].pos + 1);
      mounted.view.focus();
      const dispatch = mounted.view.dispatch.bind(mounted.view);
      vi.spyOn(mounted.view, "dispatch").mockImplementation((tr) => {
        if (tr.scrolledIntoView) nodeRects[4].mockReturnValue(createRect(100, 230, blockHeight));
        dispatch(tr);
      });

      dispatchKeyDown(mounted.view.dom, "i", { ctrl: true, alt: true });

      expect(onBlockInsertionRequested).toHaveBeenCalledWith(
        expect.objectContaining({ boundary: targets[4].pos + targets[4].node.nodeSize }),
      );
      expect(
        document.querySelector<HTMLButtonElement>("[data-leafdown-block-insert]")!.style.top,
      ).toBe("290px");
    });
  });

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

  it("repositions handles when a block resizes inside an editor that keeps its size", async () => {
    const observers: { callback: () => void; observed: Set<Element> }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        private readonly entry: (typeof observers)[number];

        constructor(callback: () => void) {
          this.entry = { callback, observed: new Set() };
          observers.push(this.entry);
        }

        observe(element: Element) {
          this.entry.observed.add(element);
        }

        unobserve(element: Element) {
          this.entry.observed.delete(element);
        }

        disconnect() {
          this.entry.observed.clear();
        }
      },
    );
    const mounted = await mountEditor("First\n\nSecond\n");
    const [first, second] = getSelectableBlockTargets(mounted.view.state.doc);
    const firstNode = mounted.view.nodeDOM(first.pos);
    const secondNode = mounted.view.nodeDOM(second.pos);
    if (!(firstNode instanceof Element) || !(secondNode instanceof Element)) {
      throw new Error("Expected rendered paragraphs.");
    }
    const blockObserver = observers.find((observer) => observer.observed.has(firstNode));
    if (!blockObserver) throw new Error("Expected the top-level blocks to be observed.");
    const { observed } = blockObserver;

    expect(observed).toEqual(new Set([mounted.view.dom, firstNode, secondNode]));

    vi.spyOn(secondNode, "getBoundingClientRect").mockReturnValue(createRect(100, 60, 40));
    blockObserver.callback();
    await settleAnimationFrame();

    expect(getHandle(second.pos).parentElement?.style.top).toBe("60px");
    expect(getHandle(second.pos).parentElement?.style.height).toBe("40px");

    mounted.view.dispatch(mounted.view.state.tr.delete(first.pos, second.pos));

    expect(mounted.view.dom.children).toHaveLength(1);
    expect(observed).toEqual(new Set([mounted.view.dom, ...mounted.view.dom.children]));
    vi.unstubAllGlobals();
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
    dispatchMouseEvent(document, "mousemove", { buttons: 1, clientX: 20, clientY: 20 });
    expect(mounted.view.dom).toHaveAttribute("data-leafdown-block-dragging");
    dispatchMouseUp(document.body, { button: 0 });

    await settleAnimationFrame();

    expect(mounted.view.dom).not.toHaveAttribute("data-leafdown-block-dragging");
    expect(onContextPopupRequested).not.toHaveBeenCalled();
  });

  it("drops a handle-selected range at a valid sibling boundary", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    const paragraphs = getSelectableBlockTargets(mounted.view.state.doc);
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, paragraphs[0].pos),
      ),
    );
    const handle = getHandle(paragraphs[0].pos);
    const target = mounted.view.nodeDOM(paragraphs[2].pos);
    if (!(target instanceof Element)) throw new Error("Expected rendered drop target.");
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue(createRect(100, 40));
    dispatchMouseDown(handle, { button: 0 });
    dispatchMouseEvent(document, "mousemove", { buttons: 1, clientX: 10, clientY: 20 });
    dispatchMouseUp(target, { button: 0, clientY: 65 });
    expect(mounted.getMarkdown()).toBe("Second\n\nThird\n\nFirst\n");
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
  });

  it("cancels a pending handle drag when the window loses focus", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    const first = getSelectableBlockTargets(mounted.view.state.doc)[0];
    const handle = getHandle(first.pos);

    dispatchMouseDown(handle, { button: 0 });
    dispatchMouseEvent(document, "mousemove", { buttons: 1, clientX: 20 });
    expect(mounted.view.dom).toHaveAttribute("data-leafdown-block-dragging");
    dispatchDOMEvent(window, "blur");
    dispatchMouseUp(document.body, { button: 0 });

    expect(mounted.view.dom).not.toHaveAttribute("data-leafdown-block-dragging");
    expect(mounted.getMarkdown()).toBe("First\n\nSecond\n");
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

  it("re-translates handles and the announcement on a language switch without touching the document", async () => {
    const mounted = await mountEditor("## Title\n\nSecond\n");
    const [heading, paragraph] = getSelectableBlockTargets(mounted.view.state.doc);
    const insertionButton = document.querySelector("[data-leafdown-block-insert]");
    const status = document.querySelector("[role='status']");
    const pseudo = createLocalization(PSEUDO_LOCALE);

    dispatchMouseDown(getHandle(heading.pos), { button: 0 });
    dispatchMouseDown(getHandle(paragraph.pos), { button: 0, shift: true });
    const { doc, selection } = mounted.view.state;

    expect(getHandle(heading.pos)).toHaveAttribute("aria-label", "Select heading 2 block");
    expect(status).toHaveTextContent("2 blocks selected");

    try {
      localizer.setLanguage(PSEUDO_LOCALE, []);

      expect(getHandle(heading.pos)).toHaveAttribute(
        "aria-label",
        pseudo.t("editor.blockSelection.selectHandle", { block: "heading", level: 2 }),
      );
      expect(getHandle(paragraph.pos)).toHaveAttribute(
        "title",
        pseudo.t("editor.blockSelection.selectHandle", { block: "paragraph" }),
      );
      expect(insertionButton).toHaveAttribute(
        "aria-label",
        pseudo.t("editor.blockSelection.insertAtBoundary"),
      );
      expect(status).toHaveTextContent(
        pseudo.t("editor.blockSelection.selectedCount", { count: 2 }),
      );
      expect(mounted.view.state.doc).toBe(doc);
      expect(mounted.view.state.selection.eq(selection)).toBe(true);
      expect(mounted.getMarkdown()).toBe("## Title\n\nSecond\n");
    } finally {
      localizer.setLanguage("en", []);
    }

    expect(getHandle(heading.pos)).toHaveAttribute("aria-label", "Select heading 2 block");
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

  it("keeps native mouse selection across table cells", async () => {
    const mounted = await mountEditor("| A | B |\n| --- | --- |\n| C | D |\n");
    const cells = [...mounted.view.dom.querySelectorAll("th, td")];
    const firstPos = mounted.view.posAtDOM(cells[0], 0);
    const lastPos = mounted.view.posAtDOM(cells[3], 0);
    vi.spyOn(mounted.view, "posAtCoords").mockImplementation(({ left }) => {
      const pos = left === 10 ? firstPos : lastPos;
      return { pos, inside: pos - 1 };
    });

    dispatchMouseDown(cells[0], { clientX: 10, clientY: 10 });
    dispatchMouseEvent(cells[3], "mousemove", { buttons: 1, clientX: 30, clientY: 30 });
    dispatchMouseUp(cells[3], { clientX: 30, clientY: 30 });

    expect(mounted.view.state.selection).toBeInstanceOf(CellSelection);
    expect(mounted.view.dom.querySelectorAll(".selectedCell")).toHaveLength(4);
  });
});
