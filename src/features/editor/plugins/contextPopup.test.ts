// @vitest-environment happy-dom

import { CellSelection } from "@milkdown/kit/prose/tables";
import { describe, expect, it, vi } from "vitest";

import type { ContextPopupRequest, ContextPopupSource } from "@/features/editor";
import {
  BASIC_TABLE_MARKDOWN,
  EXTENDED_TABLE_MARKDOWN,
  HELLO_WORLD_TEXT,
} from "@/test/fixtures/editorMarkdown";
import {
  dispatchContextMenu,
  dispatchMouseDown,
  dispatchMouseUp,
  type TestKeyboardEventOptions,
} from "@/test/utils/events";
import {
  mountMilkdownEditor,
  setupMilkdownEditorMount,
  type MountedMilkdownEditor,
} from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  runKeyDownHandlers,
  selectTableCellRange,
  setSelectionInTableCell,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";

import { getSelectedTableRect } from "../utils/tables";
import { createHierarchicalBlockSelection, getSelectableBlockTargets } from "./blockSelection";

const mountEditor = setupMilkdownEditorMount();

const settleAnimationFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const mockCoordinates = (mounted: MountedMilkdownEditor) =>
  vi.spyOn(mounted.view, "coordsAtPos").mockImplementation((pos) => ({
    bottom: 40 + pos,
    left: 10 + pos,
    right: 20 + pos,
    top: 30 + pos,
  }));

// The browser moves the selection for these keys, so the movement is dispatched beside the
// keydown rather than produced by it.
const extendSelection = (
  mounted: MountedMilkdownEditor,
  head: number,
  modifiers: TestKeyboardEventOptions = {},
) => {
  runKeyDownHandlers(mounted.view, "ArrowRight", { shift: true, ...modifiers });
  setTextSelection(mounted.view, 1, head);
};

const selectAll = (mounted: MountedMilkdownEditor) =>
  runKeyDownHandlers(mounted.view, "a", { ctrl: true, keyCode: 65 });

const trackPopupOpenState = () => {
  let popupOpen = false;

  return {
    getContextPopupOpen: () => popupOpen,
    onContextPopupClosed: vi.fn(() => {
      popupOpen = false;
    }),
    onContextPopupRequested: vi.fn(() => {
      popupOpen = true;
    }),
  };
};

const popupRequest = (
  source: ContextPopupSource,
  selectionKind: ContextPopupRequest["selectionKind"] = "text",
) => ({
  anchor: expect.objectContaining({ getRect: expect.any(Function) }),
  container: null,
  selectionKind,
  source,
});

const collectRequests = () => {
  const requests: ContextPopupRequest[] = [];

  return {
    onContextPopupRequested: vi.fn((request: ContextPopupRequest) => {
      requests.push(request);
    }),
    lastRequest: () => requests[requests.length - 1],
  };
};

describe("context popup plugin", () => {
  it("opens below the selected visual range without exposing markers through selection state", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    const coordsAtPos = mockCoordinates(mounted);
    dispatchMouseDown(mounted.view.dom, { button: 0 });
    setTextSelection(mounted.view, 1, 6);
    dispatchMouseUp(mounted.view.dom, { button: 0 });

    await waitFor(() => {
      expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
    });
    expect(coordsAtPos).toHaveBeenNthCalledWith(1, 1, 1);
    expect(coordsAtPos).toHaveBeenNthCalledWith(2, 6, -1);
  });

  it("anchors to the box spanning the selection's visible ends", async () => {
    const { onContextPopupRequested, lastRequest } = collectRequests();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    runKeyDownHandlers(mounted.view, "ContextMenu");

    expect(lastRequest().anchor.getRect("live")).toMatchObject({
      left: 11,
      top: 31,
      right: 26,
      bottom: 46,
    });
  });

  it("anchors a block selection to the union of its rendered block bounds", async () => {
    const { onContextPopupRequested, lastRequest } = collectRequests();
    const mounted = await mountEditor("First\n\nSecond\n", { onContextPopupRequested });
    const paragraphs = getSelectableBlockTargets(mounted.view.state.doc);
    const rects = [
      { bottom: 80, height: 30, left: 100, right: 300, top: 50, width: 200, x: 100, y: 50 },
      { bottom: 150, height: 40, left: 120, right: 340, top: 110, width: 220, x: 120, y: 110 },
    ];

    paragraphs.forEach(({ pos }, index) => {
      const node = mounted.view.nodeDOM(pos);
      if (!(node instanceof Element)) throw new Error("Expected a rendered paragraph.");
      vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
        ...rects[index],
        toJSON: () => rects[index],
      });
    });

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(
          mounted.view.state.doc,
          paragraphs[0].pos,
          paragraphs[1].pos,
        ),
      ),
    );

    expect(lastRequest()).toEqual(expect.objectContaining({ selectionKind: "block" }));
    expect(lastRequest().anchor.getRect("live")).toMatchObject({
      bottom: 150,
      left: 100,
      right: 340,
      top: 50,
    });
  });

  it("measures the selection as it stands rather than as it stood when the popup opened", async () => {
    const { onContextPopupRequested, lastRequest } = collectRequests();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    runKeyDownHandlers(mounted.view, "ContextMenu");

    const { anchor } = lastRequest();

    setTextSelection(mounted.view, 3, 8);

    expect(anchor.getRect("live")).toMatchObject({ top: 33, bottom: 48 });
  });

  it("anchors against the editor it belongs to", async () => {
    const { onContextPopupRequested, lastRequest } = collectRequests();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    runKeyDownHandlers(mounted.view, "ContextMenu");

    expect(lastRequest().anchor.contextElement).toBe(mounted.view.dom);
  });

  it("opens from the existing selection instead of the right-click pointer coordinates", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    const posAtCoords = vi.spyOn(mounted.view, "posAtCoords");
    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    dispatchContextMenu(mounted.view.dom, { clientX: 80, clientY: 42 });

    expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
    expect(posAtCoords).not.toHaveBeenCalled();
    expect(mounted.view.state.selection.empty).toBe(false);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);
  });

  it("opens around a caret after native pointer handling has already moved it", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 8);
    dispatchContextMenu(mounted.view.dom, { clientX: 80, clientY: 42 });

    expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer", "caret"));
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.from).toBe(8);
  });

  it.each([
    ["the Menu key", "ContextMenu", {}],
    ["Shift+F10", "F10", { shift: true }],
  ])("opens from %s as a keyboard request", async (_label, key, modifiers) => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    const { event, handled } = runKeyDownHandlers(mounted.view, key, modifiers);

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("keyboard"));
  });

  it("opens from the keyboard around a caret with no selection", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 8);
    runKeyDownHandlers(mounted.view, "ContextMenu");

    expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("keyboard", "caret"));
  });

  it("leaves an unmodified F10 to the rest of the editor", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    setTextSelection(mounted.view, 1, 6);
    // The selection opens the popup on its own, so only what F10 adds is under test here.
    onContextPopupRequested.mockClear();
    const { event, handled } = runKeyDownHandlers(mounted.view, "F10");

    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(onContextPopupRequested).not.toHaveBeenCalled();
  });

  it("does not open for an ordinary caret placement", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    dispatchMouseDown(mounted.view.dom, { button: 0 });
    setTextSelection(mounted.view, 8);
    dispatchMouseUp(mounted.view.dom, { button: 0 });

    await settleAnimationFrame();

    expect(onContextPopupRequested).not.toHaveBeenCalled();
  });

  it("opens from a selection released outside the editor", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    dispatchMouseDown(mounted.view.dom, { button: 0 });
    setTextSelection(mounted.view, 1, 6);
    dispatchMouseUp(document.body, { button: 0 });

    await waitFor(() => {
      expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
    });
  });

  it("stays closed for a pointer gesture that begins outside the editor", async () => {
    const popupState = trackPopupOpenState();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, popupState);

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    runKeyDownHandlers(mounted.view, "Escape");
    popupState.onContextPopupRequested.mockClear();

    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);

    try {
      dispatchMouseDown(elsewhere, { button: 0 });
      dispatchMouseUp(elsewhere, { button: 0 });

      await settleAnimationFrame();
    } finally {
      elsewhere.remove();
    }

    expect(popupState.onContextPopupRequested).not.toHaveBeenCalled();
  });

  it("stops completing pointer gestures once the editor is gone", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountMilkdownEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    dispatchMouseDown(mounted.view.dom, { button: 0 });
    setTextSelection(mounted.view, 1, 6);
    onContextPopupRequested.mockClear();
    await mounted.destroy();

    dispatchMouseUp(document.body, { button: 0 });

    await settleAnimationFrame();

    expect(onContextPopupRequested).not.toHaveBeenCalled();
  });

  it.each([
    ["Shift+Arrow", {}],
    ["Mod+Shift+Arrow", { ctrl: true }],
  ])(
    "opens from a selection extended with %s, leaving focus in the editor",
    async (_label, modifiers) => {
      const onContextPopupRequested = vi.fn();
      const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

      mockCoordinates(mounted);
      mounted.view.focus();
      extendSelection(mounted, 6, modifiers);

      expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
      expect(document.activeElement).toBe(mounted.view.dom);
    },
  );

  it("opens from focused-editor Mod+A, leaving focus in the editor", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    mounted.view.focus();
    selectAll(mounted);

    expect(mounted.view.state.selection.empty).toBe(false);
    expect(onContextPopupRequested).toHaveBeenCalledWith(
      expect.objectContaining({ selectionKind: "block", source: "pointer" }),
    );
    expect(document.activeElement).toBe(mounted.view.dom);
  });

  it("keeps one popup open while the selection grows", async () => {
    const popupState = trackPopupOpenState();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, popupState);

    mockCoordinates(mounted);
    mounted.view.focus();
    extendSelection(mounted, 6);
    extendSelection(mounted, 7);

    expect(popupState.onContextPopupRequested).toHaveBeenLastCalledWith(popupRequest("pointer"));
    expect(popupState.onContextPopupClosed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(mounted.view.dom);
  });

  it("stays dismissed for the rest of the selection gesture", async () => {
    const popupState = trackPopupOpenState();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, popupState);

    mockCoordinates(mounted);
    extendSelection(mounted, 6);
    runKeyDownHandlers(mounted.view, "Escape");
    popupState.onContextPopupRequested.mockClear();
    extendSelection(mounted, 7);

    expect(popupState.onContextPopupRequested).not.toHaveBeenCalled();
  });

  it("keeps Escape's dismissal when a pointer release is still queued", async () => {
    const popupState = trackPopupOpenState();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, popupState);

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    dispatchMouseDown(mounted.view.dom, { button: 0 });
    setTextSelection(mounted.view, 1, 7);
    dispatchMouseUp(mounted.view.dom, { button: 0 });
    runKeyDownHandlers(mounted.view, "Escape");
    popupState.onContextPopupRequested.mockClear();

    await settleAnimationFrame();

    expect(popupState.getContextPopupOpen()).toBe(false);
    expect(popupState.onContextPopupRequested).not.toHaveBeenCalled();

    dispatchMouseDown(mounted.view.dom, { button: 0 });
    setTextSelection(mounted.view, 1, 8);
    dispatchMouseUp(mounted.view.dom, { button: 0 });

    await settleAnimationFrame();

    expect(popupState.getContextPopupOpen()).toBe(true);
  });

  it("stays dismissed after Select all until the selection collapses", async () => {
    const popupState = trackPopupOpenState();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, popupState);

    mockCoordinates(mounted);
    selectAll(mounted);
    runKeyDownHandlers(mounted.view, "Escape");
    popupState.onContextPopupRequested.mockClear();
    extendSelection(mounted, 7);

    expect(popupState.onContextPopupRequested).not.toHaveBeenCalled();

    setTextSelection(mounted.view, 3);
    extendSelection(mounted, 6);

    expect(popupState.onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
  });

  it("holds a pointer selection back until the button is released", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    dispatchMouseDown(mounted.view.dom, { button: 0 });
    setTextSelection(mounted.view, 1, 6);

    expect(onContextPopupRequested).not.toHaveBeenCalled();

    dispatchMouseUp(mounted.view.dom, { button: 0 });

    await waitFor(() => {
      expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
    });
  });

  it("closes on Escape and typing", async () => {
    let popupOpen = true;
    const onContextPopupClosed = vi.fn(() => {
      popupOpen = false;
    });
    const mounted = await mountEditor("Hello", {
      getContextPopupOpen: () => popupOpen,
      onContextPopupClosed,
    });

    const escape = runKeyDownHandlers(mounted.view, "Escape");

    expect(escape.handled).toBe(true);
    expect(escape.event.defaultPrevented).toBe(true);
    expect(onContextPopupClosed).toHaveBeenCalledTimes(1);

    popupOpen = true;
    setTextSelection(mounted.view, 3);
    typeText(mounted.view, "x");

    expect(onContextPopupClosed).toHaveBeenCalledTimes(2);
  });

  it("refreshes or closes when keyboard-driven transactions change the selection", async () => {
    let popupOpen = false;
    const onContextPopupClosed = vi.fn(() => {
      popupOpen = false;
    });
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, {
      getContextPopupOpen: () => popupOpen,
      onContextPopupClosed,
      onContextPopupRequested,
    });

    mockCoordinates(mounted);
    popupOpen = true;
    setTextSelection(mounted.view, 1, 6);

    expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
    expect(onContextPopupClosed).not.toHaveBeenCalled();

    setTextSelection(mounted.view, 3);

    expect(onContextPopupClosed).toHaveBeenCalledTimes(1);
  });

  it("keeps the popup open and the selection intact while focus leaves the editor", async () => {
    let popupOpen = false;
    const onContextPopupClosed = vi.fn(() => {
      popupOpen = false;
    });
    const onContextPopupRequested = vi.fn(() => {
      popupOpen = true;
    });
    const mounted = await mountEditor(HELLO_WORLD_TEXT, {
      getContextPopupOpen: () => popupOpen,
      onContextPopupClosed,
      onContextPopupRequested,
    });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    runKeyDownHandlers(mounted.view, "ContextMenu");

    expect(popupOpen).toBe(true);

    // Stands in for the popup taking focus.
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);

    try {
      elsewhere.focus();

      expect(onContextPopupClosed).not.toHaveBeenCalled();

      mounted.view.focus();
    } finally {
      elsewhere.remove();
    }

    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);
  });

  it("keeps a keyboard-opened popup keyboard-sourced when its selection moves", async () => {
    let popupOpen = false;
    const onContextPopupRequested = vi.fn(() => {
      popupOpen = true;
    });
    const mounted = await mountEditor(HELLO_WORLD_TEXT, {
      getContextPopupOpen: () => popupOpen,
      onContextPopupRequested,
    });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    runKeyDownHandlers(mounted.view, "ContextMenu");
    setTextSelection(mounted.view, 2, 7);

    expect(onContextPopupRequested).toHaveBeenLastCalledWith(popupRequest("keyboard"));
  });

  describe("context", () => {
    const FENCED_CODE_MARKDOWN = "```js\nconst value = 1;\n```\n";

    const requestContext = async (
      markdown: string,
      select: (mounted: MountedMilkdownEditor) => void,
    ) => {
      const { onContextPopupRequested, lastRequest } = collectRequests();
      const mounted = await mountEditor(markdown, { onContextPopupRequested });

      mockCoordinates(mounted);
      select(mounted);
      runKeyDownHandlers(mounted.view, "ContextMenu");

      const { container, selectionKind } = lastRequest();

      return { container, selectionKind };
    };

    const selectText = (mounted: MountedMilkdownEditor, text: string, length = text.length) => {
      const from = getEditorTextPosition(mounted, text);

      setTextSelection(mounted.view, from, from + length);
    };

    it("tells a caret from a text selection", async () => {
      expect(
        await requestContext(HELLO_WORLD_TEXT, ({ view }) => {
          setTextSelection(view, 3);
        }),
      ).toEqual({ container: null, selectionKind: "caret" });
      expect(
        await requestContext(HELLO_WORLD_TEXT, ({ view }) => {
          setTextSelection(view, 1, 6);
        }),
      ).toEqual({ container: null, selectionKind: "text" });
    });

    it.each([
      ["a fenced code block", FENCED_CODE_MARKDOWN],
      ["indented code", "Before\n\n    const value = 1;\n"],
      ["frontmatter", "---\nconst: 1\n---\n\nAfter\n"],
    ])("reports a caret or selection in %s as code", async (_label, markdown) => {
      expect(
        await requestContext(markdown, (mounted) => {
          selectText(mounted, "const", 0);
        }),
      ).toEqual({ container: "code", selectionKind: "caret" });
      expect(
        await requestContext(markdown, (mounted) => {
          selectText(mounted, "const");
        }),
      ).toEqual({ container: "code", selectionKind: "text" });
    });

    it("reports a caret, text, or cell selection in a table as the table", async () => {
      expect(
        await requestContext(BASIC_TABLE_MARKDOWN, (mounted) => {
          setSelectionInTableCell(mounted, 1, 0);
        }),
      ).toEqual({ container: "table", selectionKind: "caret" });
      expect(
        await requestContext(BASIC_TABLE_MARKDOWN, (mounted) => {
          selectText(mounted, "C");
        }),
      ).toEqual({ container: "table", selectionKind: "text" });
      expect(
        await requestContext(BASIC_TABLE_MARKDOWN, (mounted) => {
          selectTableCellRange(mounted, { col: 0, row: 0 }, { col: 1, row: 1 });
        }),
      ).toEqual({ container: "table", selectionKind: "text" });
    });

    it("switches table axes while retaining the original targets and keyboard source", async () => {
      const { onContextPopupRequested, lastRequest } = collectRequests();
      const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN, {
        onContextPopupRequested,
        getContextPopupOpen: () => true,
      });
      mockCoordinates(mounted);
      setSelectionInTableCell(mounted, 2, 1);
      runKeyDownHandlers(mounted.view, "ContextMenu");
      const doc = mounted.view.state.doc;
      expect(lastRequest().table).toMatchObject({
        axis: "row",
        row: { from: 2, to: 3 },
        column: { from: 1, to: 2 },
      });

      lastRequest().table!.selectAxis("row");
      expect((mounted.view.state.selection as CellSelection).isRowSelection()).toBe(true);
      lastRequest().table!.selectAxis("column");
      expect((mounted.view.state.selection as CellSelection).isColSelection()).toBe(true);
      expect(getSelectedTableRect(mounted.view.state)).toMatchObject({ left: 1, right: 2 });
      expect(lastRequest().table).toMatchObject({
        axis: "column",
        row: { from: 2, to: 3 },
        column: { from: 1, to: 2 },
      });
      lastRequest().table!.selectAxis("row");
      expect(getSelectedTableRect(mounted.view.state)).toMatchObject({ top: 2, bottom: 3 });
      expect(lastRequest().source).toBe("keyboard");
      expect(mounted.view.state.doc).toBe(doc);

      const stale = lastRequest().table!;
      setSelectionInTableCell(mounted, 1, 0);
      const selection = mounted.view.state.selection;
      stale.selectAxis("column");
      expect(mounted.view.state.selection).toBe(selection);
      runKeyDownHandlers(mounted.view, "ContextMenu");
      expect(lastRequest().table).toMatchObject({
        row: { from: 1, to: 2 },
        column: { from: 0, to: 1 },
      });
    });

    it("preserves multiple row and column targets when switching a cell range", async () => {
      const { onContextPopupRequested, lastRequest } = collectRequests();
      const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN, {
        onContextPopupRequested,
        getContextPopupOpen: () => true,
      });
      mockCoordinates(mounted);
      selectTableCellRange(mounted, { row: 2, col: 1 }, { row: 1, col: 0 });
      runKeyDownHandlers(mounted.view, "ContextMenu");
      lastRequest().table!.selectAxis("row");
      lastRequest().table!.selectAxis("column");
      expect(getSelectedTableRect(mounted.view.state)).toMatchObject({ left: 0, right: 2 });
      lastRequest().table!.selectAxis("row");
      expect(getSelectedTableRect(mounted.view.state)).toMatchObject({ top: 1, bottom: 3 });
    });

    it("reports no container for a selection reaching out of one", async () => {
      expect(
        await requestContext(`Before\n\n${FENCED_CODE_MARKDOWN}`, (mounted) => {
          setTextSelection(
            mounted.view,
            getEditorTextPosition(mounted, "fore"),
            getEditorTextPosition(mounted, "value"),
          );
        }),
      ).toEqual({ container: null, selectionKind: "text" });
    });

    it("reports a structural selection of a code block as a block selection", async () => {
      expect(
        await requestContext(`${FENCED_CODE_MARKDOWN}\nAfter\n`, ({ view }) => {
          const [codeBlock] = getSelectableBlockTargets(view.state.doc);

          view.dispatch(
            view.state.tr.setSelection(
              createHierarchicalBlockSelection(view.state.doc, codeBlock.pos, codeBlock.pos),
            ),
          );
        }),
      ).toEqual({ container: null, selectionKind: "block" });
    });
  });
});
