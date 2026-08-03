import { describe, expect, it, vi } from "vitest";

import type { ContextPopupRequest, ContextPopupSource } from "@/features/editor";
import { HELLO_WORLD_TEXT } from "@/test/fixtures/editorMarkdown";
import {
  dispatchContextMenu,
  dispatchMouseDown,
  dispatchMouseUp,
  type TestKeyboardEventOptions,
} from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { runKeyDownHandlers, setTextSelection, typeText } from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";

const mountEditor = setupMilkdownEditorMount();

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

const popupRequest = (source: ContextPopupSource) => ({
  anchor: expect.objectContaining({ getRect: expect.any(Function) }),
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

    expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
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

    expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("keyboard"));
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

    setTextSelection(mounted.view, 8);
    dispatchMouseUp(mounted.view.dom, { button: 0 });

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

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

  it("opens from Select all, leaving focus in the editor", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    mounted.view.focus();
    selectAll(mounted);

    expect(mounted.view.state.selection.empty).toBe(false);
    expect(onContextPopupRequested).toHaveBeenCalledWith(popupRequest("pointer"));
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
});
