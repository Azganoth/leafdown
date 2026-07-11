import { describe, expect, it, vi } from "vitest";

import {
  BASIC_TABLE_MARKDOWN,
  BOLD_PLAIN_MARKDOWN,
  HELLO_WORLD_TEXT,
} from "@/test/fixtures/editorMarkdown";
import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextPosition,
  getSelectedEditorText,
  setSelectionAtElementTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveInlineSourceProjection } from "./inlineSourceProjection";

const mountEditor = setupMilkdownEditorMount();

const waitForSelectionNormalization = () =>
  new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

const dispatchDoubleClick = (target: Element, button = 0) =>
  dispatchMouseEvent(target, "dblclick", { button });

describe("double-click selection plugin", () => {
  it("removes trailing horizontal whitespace without changing Markdown or dirty state", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(HELLO_WORLD_TEXT, { onContentChanged });

    setTextSelection(mounted.view, 1, 7);
    dispatchDoubleClick(mounted.view.dom);
    await waitForSelectionNormalization();

    expect(getSelectedEditorText(mounted)).toBe("Hello");
    expect(mounted.getMarkdown()).toBe("Hello world\n");
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it("removes every trailing horizontal whitespace character and preserves selection direction", async () => {
    const mounted = await mountEditor("Hello \t\u00A0world");
    const selectionEnd = 1 + "Hello \t\u00A0".length;

    setTextSelection(mounted.view, selectionEnd, 1);
    dispatchDoubleClick(mounted.view.dom);
    await waitForSelectionNormalization();

    expect(getSelectedEditorText(mounted)).toBe("Hello");
    expect(mounted.view.state.selection.anchor).toBe(6);
    expect(mounted.view.state.selection.head).toBe(1);
  });

  it.each([
    { initialMarkdown: "**Hello** world", name: "formatted text" },
    { initialMarkdown: "[Hello](guide.md) world", name: "link text" },
  ])("normalizes selections in $name", async ({ initialMarkdown }) => {
    const mounted = await mountEditor(initialMarkdown);

    setTextSelection(mounted.view, 1, 7);
    dispatchDoubleClick(mounted.view.dom);
    await waitForSelectionNormalization();

    expect(getSelectedEditorText(mounted)).toBe("Hello");
    expect(mounted.getMarkdown()).toBe(`${initialMarkdown}\n`);
  });

  it("normalizes selections in table cells", async () => {
    const mounted = await mountEditor(BASIC_TABLE_MARKDOWN);
    const cellTextPosition = getEditorTextPosition(mounted, "A");

    mounted.view.dispatch(mounted.view.state.tr.insertText(" ", cellTextPosition + 1));
    setTextSelection(mounted.view, cellTextPosition, cellTextPosition + 2);
    dispatchDoubleClick(mounted.view.dom);
    await waitForSelectionNormalization();

    expect(getSelectedEditorText(mounted)).toBe("A");
  });

  it("leaves multi-word, non-primary, and inline-source-projection selections untouched", async () => {
    const mounted = await mountEditor("Hello world more");

    setTextSelection(mounted.view, 1, 13);
    dispatchDoubleClick(mounted.view.dom);
    await waitForSelectionNormalization();
    expect(getSelectedEditorText(mounted)).toBe("Hello world ");

    setTextSelection(mounted.view, 1, 7);
    dispatchDoubleClick(mounted.view.dom, 2);
    await waitForSelectionNormalization();
    expect(getSelectedEditorText(mounted)).toBe("Hello ");

    const projectionEditor = await mountEditor(BOLD_PLAIN_MARKDOWN);
    const strong = getEditorDomElement(projectionEditor, "strong");
    setSelectionAtElementTextEnd(projectionEditor.view, strong);

    expect(hasActiveInlineSourceProjection(projectionEditor.view.state)).toBe(true);

    const sourceStart = getEditorTextPosition(projectionEditor, "**Bold**");
    setTextSelection(projectionEditor.view, sourceStart + "**Bold".length);
    typeText(projectionEditor.view, " ");
    setTextSelection(projectionEditor.view, sourceStart + 2, sourceStart + "**Bold ".length);

    dispatchDoubleClick(projectionEditor.view.dom);
    await waitForSelectionNormalization();
    expect(getSelectedEditorText(projectionEditor)).toBe("Bold ");
  });
});
