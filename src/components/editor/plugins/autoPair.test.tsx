import { afterEach, describe, expect, it } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  pressKey,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (
  initialMarkdown: string,
  options: { autoPairBracketsAndQuotes?: boolean } = {},
): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, options);
  mountedEditors.push(mounted);
  return mounted;
};

describe("Leafdown auto-pair plugin", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

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

  it("skips over existing closing delimiters and removes empty pairs on backspace", async () => {
    const mounted = await mountEditor("()");

    setTextSelection(mounted.view, 2);
    typeText(mounted.view, ")");

    expect(mounted.view.state.selection.from).toBe(3);
    expect(mounted.getMarkdown()).toBe("()\n");

    setTextSelection(mounted.view, 2);
    const { handled } = pressKey(mounted.view, "Backspace");

    expect(handled).toBe(true);
    expect(mounted.getMarkdown()).not.toContain("(");
    expect(mounted.getMarkdown()).not.toContain(")");
  });
});
