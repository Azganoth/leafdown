import { describe, expect, it } from "vitest";

import { HELLO_WORLD_TEXT, TWO_PARAGRAPH_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setSelectionAtDocumentEnd, setTextSelection } from "@/test/utils/prosemirror";

import {
  jumpToBottom,
  jumpToLineEnd,
  jumpToLineStart,
  jumpToSelection,
  jumpToTop,
  selectAll,
  selectWord,
} from "./selection";

const mountEditor = setupMilkdownEditorMount();

describe("editor selection commands", () => {
  it("selects all content and the active word", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    setTextSelection(mounted.view, 3);

    expect(selectWord(mounted.view)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);

    expect(selectAll(mounted.view)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(0);
    expect(mounted.view.state.selection.to).toBe(mounted.view.state.doc.content.size);
  });

  it("jumps to document and line boundaries", async () => {
    const mounted = await mountEditor(TWO_PARAGRAPH_MARKDOWN);

    setSelectionAtDocumentEnd(mounted.view);

    expect(jumpToTop(mounted.view)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);

    expect(jumpToBottom(mounted.view)).toBe(true);
    const documentEnd = mounted.view.state.selection.from;

    expect(documentEnd).toBeGreaterThan(1);

    expect(jumpToLineStart(mounted.view)).toBe(true);
    expect(mounted.view.state.selection.from).toBeLessThan(documentEnd);

    expect(jumpToLineEnd(mounted.view)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(documentEnd);
  });

  it("scrolls the active selection without changing it", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    setTextSelection(mounted.view, 1, 6);

    expect(jumpToSelection(mounted.view)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);
  });
});
