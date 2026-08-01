import { describe, expect, it, vi } from "vitest";

import { HELLO_WORLD_TEXT } from "@/test/fixtures/editorMarkdown";
import { dispatchContextMenu, dispatchMouseUp } from "@/test/utils/events";
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

describe("context popup plugin", () => {
  it("opens below the selected visual range without exposing markers through selection state", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    const coordsAtPos = mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    dispatchMouseUp(mounted.view.dom, { button: 0 });

    await waitFor(() => {
      expect(onContextPopupRequested).toHaveBeenCalledWith({
        anchor: { x: 19, top: 31, bottom: 46 },
        source: "pointer",
      });
    });
    expect(coordsAtPos).toHaveBeenNthCalledWith(1, 1, 1);
    expect(coordsAtPos).toHaveBeenNthCalledWith(2, 6, -1);
  });

  it("opens from the existing selection instead of the right-click pointer coordinates", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    const posAtCoords = vi.spyOn(mounted.view, "posAtCoords");
    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    dispatchContextMenu(mounted.view.dom, { clientX: 80, clientY: 42 });

    expect(onContextPopupRequested).toHaveBeenCalledWith({
      anchor: { x: 19, top: 31, bottom: 46 },
      source: "pointer",
    });
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

    expect(onContextPopupRequested).toHaveBeenCalledWith({
      anchor: { x: 23, top: 38, bottom: 48 },
      source: "pointer",
    });
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
    // The suppressed default is the contextmenu event the key would produce, which would
    // otherwise reopen the same popup through the pointer path and leave focus behind.
    expect(event.defaultPrevented).toBe(true);
    expect(onContextPopupRequested).toHaveBeenCalledWith({
      anchor: { x: 19, top: 31, bottom: 46 },
      source: "keyboard",
    });
  });

  it("opens from the keyboard around a caret with no selection", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 8);
    runKeyDownHandlers(mounted.view, "ContextMenu");

    expect(onContextPopupRequested).toHaveBeenCalledWith({
      anchor: { x: 23, top: 38, bottom: 48 },
      source: "keyboard",
    });
  });

  it("leaves an unmodified F10 to the rest of the editor", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    setTextSelection(mounted.view, 1, 6);
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

    expect(onContextPopupRequested).toHaveBeenCalledWith({
      anchor: { x: 19, top: 31, bottom: 46 },
      source: "pointer",
    });
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

    // Standing in for the popup taking focus, which is what a keyboard open does next.
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

    expect(onContextPopupRequested).toHaveBeenLastCalledWith({
      anchor: { x: 20, top: 32, bottom: 47 },
      source: "keyboard",
    });
  });
});
