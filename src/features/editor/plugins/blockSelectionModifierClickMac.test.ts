// @vitest-environment happy-dom

import { TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

// ProseMirror chooses its node-selection modifier from navigator.platform at module load.
vi.hoisted(() => {
  Object.defineProperty(navigator, "platform", { configurable: true, value: "MacIntel" });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
  });
});

const mountEditor = setupMilkdownEditorMount();

describe("macOS block selection modifier", () => {
  it.each([
    ["Paragraph text\n", true],
    ["# Heading text\n", true],
    ["Paragraph text\n", false],
  ] as const)(
    "keeps Meta-click in ordinary text out of node selection: %s, modifier held on release: %s",
    async (markdown, metaOnRelease) => {
      const mounted = await mountEditor(markdown);
      const target = mounted.view.nodeDOM(0) as HTMLElement;
      vi.spyOn(mounted.view, "posAtCoords").mockReturnValue({ pos: 3, inside: 0 });

      for (const type of ["mousedown", "mouseup", "click"]) {
        dispatchMouseEvent(target, type, {
          meta: type === "mousedown" || metaOnRelease,
          clientX: 10,
          clientY: 10,
        });
      }

      expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
      expect(mounted.view.state.selection.from).toBe(3);
      expect(mounted.view.hasFocus()).toBe(true);
      expect(mounted.view.dom.querySelector(".ProseMirror-selectednode")).toBeNull();
      expect(mounted.getMarkdown()).toBe(markdown);
    },
  );
});
