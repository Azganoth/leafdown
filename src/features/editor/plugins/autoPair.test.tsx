import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();

const runTextInputHandlers = (mounted: MountedMilkdownEditor, text: string) => {
  const { from, to } = mounted.view.state.selection;

  return (
    mounted.view.someProp("handleTextInput", (handler) =>
      handler(mounted.view, from, to, text, () => mounted.view.state.tr.insertText(text, from, to)),
    ) ?? false
  );
};

describe("Leafdown auto-pair plugin", () => {
  it("inserts matching bracket pairs and keeps the caret between them", async () => {
    const mounted = await mountEditor("Hello");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "(");

    expect(mounted.getMarkdown()).toBe("Hello()\n");

    typeText(mounted.view, "x");

    expect(mounted.getMarkdown()).toBe("Hello(x)\n");
  });

  it("wraps selected text with matching delimiters", async () => {
    const mounted = await mountEditor("Hello");

    setTextSelection(mounted.view, 1, 6);
    typeText(mounted.view, "[");

    expect(mounted.view.dom).toHaveTextContent("[Hello]");
    expect(mounted.getMarkdown()).toBe("\\[Hello]\n");
  });

  it("lets normal text insertion handle delimiters when disabled", async () => {
    const mounted = await mountEditor("Hello", { autoPairBracketsAndQuotes: false });

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "(");

    expect(mounted.getMarkdown()).toBe("Hello(\n");
  });

  it("pairs quotes at non-word boundaries and around selected text", async () => {
    const emptyEditor = await mountEditor("");

    typeText(emptyEditor.view, '"');

    expect(getEditorTextContent(emptyEditor)).toBe('""');

    const selectedTextEditor = await mountEditor("Hello");

    setTextSelection(selectedTextEditor.view, 1, 6);
    typeText(selectedTextEditor.view, "'");

    expect(getEditorTextContent(selectedTextEditor)).toBe("'Hello'");
  });

  it("lets normal text insertion handle quotes immediately after word characters", async () => {
    const mounted = await mountEditor("Hello");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, '"');

    expect(getEditorTextContent(mounted)).toBe('Hello"');
  });

  it("lets normal text insertion handle delimiters while composing text", async () => {
    const mounted = await mountEditor("Hello");

    Object.defineProperty(mounted.view, "composing", {
      configurable: true,
      value: true,
    });
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "(");

    expect(getEditorTextContent(mounted)).toBe("Hello(");
  });

  it("does not handle selections across textblock parents", async () => {
    const mounted = await mountEditor("First\n\nSecond");
    const firstStart = getEditorTextPosition(mounted, "First");
    const secondEnd = getEditorTextPosition(mounted, "Second") + "Second".length;

    setTextSelection(mounted.view, firstStart, secondEnd);

    expect(runTextInputHandlers(mounted, "(")).toBe(false);
    expect(mounted.getMarkdown()).toBe("First\n\nSecond\n");
  });

  it("skips over existing closing delimiters and removes empty pairs on backspace", async () => {
    const mounted = await mountEditor("()");

    setTextSelection(mounted.view, 2);
    typeText(mounted.view, ")");

    expect(mounted.view.state.selection.from).toBe(3);
    expect(mounted.getMarkdown()).toBe("()\n");

    setTextSelection(mounted.view, 2);
    const { handled } = runKeyDownHandlers(mounted.view, "Backspace");

    expect(handled).toBe(true);
    expect(mounted.getMarkdown()).not.toContain("(");
    expect(mounted.getMarkdown()).not.toContain(")");
  });

  it("lets modifier Backspace use normal editor behavior", async () => {
    const mounted = await mountEditor("()");

    setTextSelection(mounted.view, 2);
    const { event, handled } = runKeyDownHandlers(mounted.view, "Backspace", { ctrl: true });

    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(mounted.getMarkdown()).toBe("()\n");
  });
});
