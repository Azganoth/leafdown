import { describe, expect, it, vi } from "vitest";

import { HELLO_WORLD_TEXT } from "@/test/fixtures/editorMarkdown";
import { dispatchContextMenu, dispatchMouseUp } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { runKeyDownHandlers, setTextSelection, typeText } from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";

const mountEditor = setupMilkdownEditorMount();

const mockCoordinates = (mounted: MountedMilkdownEditor) => {
  vi.spyOn(mounted.view, "coordsAtPos").mockImplementation((pos) => ({
    bottom: 40 + pos,
    left: 10 + pos,
    right: 20 + pos,
    top: 30 + pos,
  }));
  vi.spyOn(mounted.view, "posAtCoords").mockReturnValue({ inside: -1, pos: 3 });
};

describe("context popup plugin", () => {
  it("opens from pointer selection without exposing markers through selection state", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    dispatchMouseUp(mounted.view.dom, { button: 0 });

    await waitFor(() => {
      expect(onContextPopupRequested).toHaveBeenCalledWith({ x: 19, y: 31 });
    });
  });

  it("moves the caret for right-clicks outside the current selection", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    vi.mocked(mounted.view.posAtCoords).mockReturnValue({ inside: -1, pos: 8 });
    setTextSelection(mounted.view, 1, 6);
    dispatchContextMenu(mounted.view.dom, { clientX: 80, clientY: 42 });

    expect(onContextPopupRequested).toHaveBeenCalledWith({ x: 80, y: 42 });
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.from).toBe(8);
  });

  it("preserves the active selection for right-clicks inside it", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContextPopupRequested });

    mockCoordinates(mounted);
    vi.mocked(mounted.view.posAtCoords).mockReturnValue({ inside: -1, pos: 3 });
    setTextSelection(mounted.view, 1, 6);
    dispatchContextMenu(mounted.view.dom, { clientX: 80, clientY: 42 });

    expect(mounted.view.state.selection.empty).toBe(false);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);
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

    expect(onContextPopupRequested).toHaveBeenCalledWith({ x: 19, y: 31 });
    expect(onContextPopupClosed).not.toHaveBeenCalled();

    setTextSelection(mounted.view, 3);

    expect(onContextPopupClosed).toHaveBeenCalledTimes(1);
  });
});
