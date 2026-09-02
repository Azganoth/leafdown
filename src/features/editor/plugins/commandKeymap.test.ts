// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { BOLD_PLAIN_MARKDOWN, STRONG_HELLO_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { dispatchKeyDown, type TestKeyboardEventOptions } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();

const dispatchEditorShortcut = (
  target: EventTarget,
  key: string,
  options: TestKeyboardEventOptions = {},
) => dispatchKeyDown(target, key, { ...options, keyCode: key.codePointAt(0) });

describe("Leafdown editor command keymap", () => {
  it.each([
    {
      expectedPosition: 1,
      key: "Home",
      modifiers: { ctrl: true },
      selectionPosition: "end",
    },
    {
      expectedPosition: "end",
      key: "End",
      modifiers: { ctrl: true },
      selectionPosition: 1,
    },
    {
      expectedPosition: "secondStart",
      key: "Home",
      modifiers: {},
      selectionPosition: "secondMiddle",
    },
    {
      expectedPosition: "end",
      key: "End",
      modifiers: {},
      selectionPosition: "secondMiddle",
    },
  ] as const)(
    "routes $modifiers+$key through the editor selection command",
    async ({ expectedPosition, key, modifiers, selectionPosition }) => {
      const mounted = await mountEditor("First\n\nSecond");
      const secondStart = getEditorTextPosition(mounted, "Second");
      const documentEnd = mounted.view.state.doc.content.size - 1;

      if (selectionPosition === "end") {
        setSelectionAtDocumentEnd(mounted.view);
      } else if (selectionPosition === "secondMiddle") {
        setTextSelection(mounted.view, secondStart + 3);
      } else {
        setTextSelection(mounted.view, selectionPosition);
      }

      const event = dispatchEditorShortcut(mounted.view.dom, key, modifiers);
      const resolvedExpectedPosition =
        expectedPosition === "end"
          ? documentEnd
          : expectedPosition === "secondStart"
            ? secondStart
            : expectedPosition;

      expect(event.defaultPrevented).toBe(true);
      expect(mounted.view.state.selection.from).toBe(resolvedExpectedPosition);
    },
  );

  it("inserts a link through the editor-owned shortcut", async () => {
    const mounted = await mountEditor("Hello");

    setTextSelection(mounted.view, 1, 6);

    const event = dispatchEditorShortcut(mounted.view.dom, "k", { ctrl: true });

    expect(event.defaultPrevented).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("[Hello]()");
  });

  it("clears inline formatting through the editor-owned shortcut", async () => {
    const mounted = await mountEditor(STRONG_HELLO_MARKDOWN);

    setTextSelection(mounted.view, 1, 6);

    const event = dispatchEditorShortcut(mounted.view.dom, "\\", { ctrl: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.getMarkdown()).toBe("Hello world\n");
  });

  it("toggles task-list formatting through the editor-owned shortcut", async () => {
    const mounted = await mountEditor("Task");

    setSelectionAtDocumentEnd(mounted.view);

    const event = dispatchEditorShortcut(mounted.view.dom, "9", { alt: true, ctrl: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.getMarkdown()).toBe("* [ ] Task\n");
  });

  it("toggles the active task through the editor-owned shortcut", async () => {
    const mounted = await mountEditor("- [ ] Task");

    setSelectionAtDocumentEnd(mounted.view);

    const event = dispatchEditorShortcut(mounted.view.dom, "Enter", { ctrl: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.getMarkdown()).toBe("- [x] Task\n");
  });

  it.each([
    {
      expectedMarkdown: "*Single **asterisk** emphasis*\n",
      key: "b",
      modifiers: { ctrl: true },
    },
    {
      expectedMarkdown: "*Single* asterisk *emphasis*\n",
      key: "i",
      modifiers: { ctrl: true },
    },
    {
      expectedMarkdown: "*Single ~~asterisk~~ emphasis*\n",
      key: "x",
      modifiers: { alt: true, ctrl: true },
    },
    {
      expectedMarkdown: "*Single* `asterisk` *emphasis*\n",
      key: "e",
      modifiers: { ctrl: true },
    },
  ])(
    "routes $key through its inline-formatting command",
    async ({ expectedMarkdown, key, modifiers }) => {
      const mounted = await mountEditor("*Single asterisk emphasis*");
      const selectionFrom = getEditorTextPosition(mounted, "asterisk");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "asterisk".length);

      const event = dispatchEditorShortcut(mounted.view.dom, key, modifiers);

      expect(event.defaultPrevented).toBe(true);
      expect(getSelectedEditorText(mounted)).toBe("asterisk");
      expect(mounted.getMarkdown()).toBe(expectedMarkdown);
    },
  );

  it.each([
    {
      expectedMarkdown: "Heading\n",
      initialMarkdown: "### Heading",
      key: "0",
      modifiers: { alt: true, ctrl: true },
    },
    {
      expectedMarkdown: "Heading\n",
      initialMarkdown: "## Heading",
      key: "2",
      modifiers: { alt: true, ctrl: true },
    },
    {
      expectedMarkdown: "1. Item\n",
      initialMarkdown: "- Item",
      key: "7",
      modifiers: { alt: true, ctrl: true },
    },
    {
      expectedMarkdown: "* Item\n",
      initialMarkdown: "Item",
      key: "8",
      modifiers: { alt: true, ctrl: true },
    },
    {
      expectedMarkdown: "Quote\n",
      initialMarkdown: "> Quote",
      key: "b",
      modifiers: { ctrl: true, shift: true },
    },
    {
      expectedMarkdown: "const value = 1;\n",
      initialMarkdown: "```\nconst value = 1;\n```",
      key: "c",
      modifiers: { alt: true, ctrl: true },
    },
  ])(
    "routes $key through its block-formatting command",
    async ({ expectedMarkdown, initialMarkdown, key, modifiers }) => {
      const mounted = await mountEditor(initialMarkdown);

      setSelectionAtDocumentEnd(mounted.view);

      const event = dispatchEditorShortcut(mounted.view.dom, key, modifiers);

      expect(event.defaultPrevented).toBe(true);
      expect(mounted.getMarkdown()).toBe(expectedMarkdown);
    },
  );

  it.each([
    ["y", { ctrl: true }],
    ["z", { ctrl: true, shift: true }],
  ] satisfies Array<[string, TestKeyboardEventOptions]>)(
    "keeps projection-local history in the editor for redo through $key",
    async (key, modifiers) => {
      const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN);

      setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));
      typeText(mounted.view, "er");
      dispatchEditorShortcut(mounted.view.dom, "z", { ctrl: true });

      expect(getEditorTextContent(mounted)).toBe("**Bolde** plain");

      const event = dispatchEditorShortcut(mounted.view.dom, key, modifiers);

      expect(event.defaultPrevented).toBe(true);
      expect(getEditorTextContent(mounted)).toBe("**Bolder** plain");
    },
  );

  it("consumes an editor-owned history shortcut when no history is available", async () => {
    const mounted = await mountEditor("Hello");

    const event = dispatchEditorShortcut(mounted.view.dom, "z", { ctrl: true });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.getMarkdown()).toBe("Hello\n");
  });
});
