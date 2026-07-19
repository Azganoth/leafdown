import { describe, expect, it } from "vitest";

import { dispatchKeyDown, type TestKeyboardEventOptions } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  setTextSelection,
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
    const mounted = await mountEditor("**Hello** world");

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
    expect(mounted.getMarkdown()).toBe("* [x] Task\n");
  });
});
