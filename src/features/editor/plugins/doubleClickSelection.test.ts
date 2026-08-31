// @vitest-environment happy-dom

import type { EditorView } from "@milkdown/kit/prose/view";
import { describe, expect, it, vi } from "vitest";

import {
  BASIC_TABLE_MARKDOWN,
  BOLD_PLAIN_MARKDOWN,
  HELLO_WORLD_TEXT,
  STRONG_HELLO_MARKDOWN,
} from "@/test/fixtures/editorMarkdown";
import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextPosition,
  getSelectedEditorText,
  setSelectionAtElementTextEnd,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "./sourceProjection";

const mountEditor = setupMilkdownEditorMount();

const dispatchEditorDoubleClick = (view: EditorView, position: number, button = 0) => {
  const posAtCoords = vi.spyOn(view, "posAtCoords").mockReturnValue({ inside: -1, pos: position });
  const eventOptions = { button, clientX: 20, clientY: 20 };
  const target = view.dom.firstElementChild ?? view.dom;

  dispatchMouseEvent(target, "mousedown", eventOptions);
  dispatchMouseEvent(target, "mouseup", eventOptions);
  const secondMouseDown = dispatchMouseEvent(target, "mousedown", eventOptions);

  posAtCoords.mockRestore();

  return secondMouseDown;
};

describe("double-click selection plugin", () => {
  it("selects only the active word without changing Markdown or dirty state", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContentChanged });
    const wordPosition = getEditorTextPosition(mounted, "Hello") + 2;

    const event = dispatchEditorDoubleClick(mounted.view, wordPosition);

    expect(event.defaultPrevented).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("Hello");
    expect(mounted.getMarkdown()).toBe("Hello world\n");
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it.each([
    { initialMarkdown: STRONG_HELLO_MARKDOWN, name: "formatted text" },
    { initialMarkdown: "[Hello](guide.md) world", name: "link text" },
  ])("selects the active word in $name", async ({ initialMarkdown }) => {
    const mounted = await mountEditor(initialMarkdown);
    const wordPosition = getEditorTextPosition(mounted, "Hello") + 2;

    const event = dispatchEditorDoubleClick(mounted.view, wordPosition);

    expect(event.defaultPrevented).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("Hello");
  });

  it("selects the active word in table cells", async () => {
    const mounted = await mountEditor(BASIC_TABLE_MARKDOWN);
    const cellTextPosition = getEditorTextPosition(mounted, "A");

    const event = dispatchEditorDoubleClick(mounted.view, cellTextPosition);

    expect(event.defaultPrevented).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("A");
  });

  it("leaves non-text and non-primary interactions native", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    expect(dispatchEditorDoubleClick(mounted.view, 0).defaultPrevented).toBe(false);
    expect(dispatchEditorDoubleClick(mounted.view, 3, 2).defaultPrevented).toBe(false);

    const projectionEditor = await mountEditor(BOLD_PLAIN_MARKDOWN);
    const strong = getEditorDomElement(projectionEditor, "strong");
    setSelectionAtElementTextEnd(projectionEditor.view, strong);

    expect(hasActiveSourceProjection(projectionEditor.view.state)).toBe(true);

    const event = dispatchEditorDoubleClick(projectionEditor.view, 4);

    expect(event.defaultPrevented).toBe(true);
    expect(getSelectedEditorText(projectionEditor)).toBe("Bold");
  });
});
