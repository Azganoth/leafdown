import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { pressKey, setTextSelection, typeText } from "@/test/utils/prosemirror";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (
  initialMarkdown: string,
  options: Parameters<typeof mountMilkdownEditor>[1] = {},
): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, options);
  mountedEditors.push(mounted);
  return mounted;
};

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
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("opens from pointer selection without exposing markers through selection state", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor("Hello world", { onContextPopupRequested });

    mockCoordinates(mounted);
    setTextSelection(mounted.view, 1, 6);
    mounted.view.dom.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        button: 0,
      }),
    );

    await waitFor(() => {
      expect(onContextPopupRequested).toHaveBeenCalledWith({
        anchor: { x: 19, y: 31 },
        source: "selection",
      });
    });
  });

  it("moves the caret for right-clicks outside the current selection", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor("Hello world", { onContextPopupRequested });

    mockCoordinates(mounted);
    vi.mocked(mounted.view.posAtCoords).mockReturnValue({ inside: -1, pos: 8 });
    setTextSelection(mounted.view, 1, 6);
    mounted.view.dom.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 42,
      }),
    );

    expect(onContextPopupRequested).toHaveBeenCalledWith({
      anchor: { x: 80, y: 42 },
      source: "rightClick",
    });
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.from).toBe(8);
  });

  it("preserves the active selection for right-clicks inside it", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor("Hello world", { onContextPopupRequested });

    mockCoordinates(mounted);
    vi.mocked(mounted.view.posAtCoords).mockReturnValue({ inside: -1, pos: 3 });
    setTextSelection(mounted.view, 1, 6);
    mounted.view.dom.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 42,
      }),
    );

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

    const escape = pressKey(mounted.view, "Escape");

    expect(escape.handled).toBe(true);
    expect(escape.event.defaultPrevented).toBe(true);
    expect(onContextPopupClosed).toHaveBeenCalledTimes(1);

    popupOpen = true;
    setTextSelection(mounted.view, 3);
    typeText(mounted.view, "x");

    expect(onContextPopupClosed).toHaveBeenCalledTimes(2);
  });
});
