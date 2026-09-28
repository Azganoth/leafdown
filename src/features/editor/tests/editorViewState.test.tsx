// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { MilkdownEditor, type EditorViewState, type MilkdownEditorBridge } from "@/features/editor";
import { render, waitFor } from "@/test/utils/react";

const renderEditor = async (initialMarkdown: string, initialViewState?: EditorViewState) => {
  let bridge: MilkdownEditorBridge | null = null;
  const onContentChanged = vi.fn();

  render(
    <MilkdownEditor
      initialMarkdown={initialMarkdown}
      initialViewState={initialViewState}
      onContentChanged={onContentChanged}
      ref={(nextBridge) => {
        bridge = nextBridge;
      }}
    />,
  );

  await waitFor(() => expect(bridge?.getViewState?.()).not.toBeNull());

  return { getViewState: () => bridge?.getViewState?.() ?? null, onContentChanged };
};

describe("editor view state", () => {
  it("starts with the caret at the beginning and the editor unfocused", async () => {
    const { getViewState } = await renderEditor("First paragraph");

    expect(getViewState()).toEqual({ anchor: 1, head: 1, focused: false });
  });

  it("restores a selection that still fits the document without marking it changed", async () => {
    const { getViewState, onContentChanged } = await renderEditor("First paragraph", {
      anchor: 3,
      head: 8,
      focused: false,
    });

    expect(getViewState()).toEqual({ anchor: 3, head: 8, focused: false });
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it("moves a caret past the end of shorter text to the nearest text position and focuses", async () => {
    const { getViewState } = await renderEditor("# Short\n\nEnd", {
      anchor: 400,
      head: 400,
      focused: true,
    });

    expect(getViewState()).toEqual({ anchor: 11, head: 11, focused: true });
    expect(document.activeElement).toHaveAttribute("contenteditable", "true");
  });
});
