import { describe, expect, it } from "vitest";

import { HELLO_WORLD_TEXT, TWO_PARAGRAPH_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorTextContent, setTextSelection, typeText } from "@/test/utils/prosemirror";

import { selectAll } from "../editing/selection";
import {
  canClearInlineFormat,
  clearInlineFormat,
  toggleEmphasis,
  toggleInlineCode,
  toggleStrikethrough,
  toggleStrong,
} from "./inline";

const mountEditor = setupMilkdownEditorMount();

describe("editor inline formatting commands", () => {
  it("toggles inline formatting for selections and nearest words", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    setTextSelection(mounted.view, 1, 6);

    expect(canClearInlineFormat(mounted.view.state)).toBe(false);
    expect(toggleStrong(mounted.view)).toBe(true);
    expect(canClearInlineFormat(mounted.view.state)).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("Hello");
    expect(mounted.getMarkdown()).toContain("**Hello** world");

    expect(toggleStrong(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();

    setTextSelection(mounted.view, 8);

    expect(toggleEmphasis(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toContain("*world*");
    expect(mounted.getMarkdown()).toContain("*world*");

    expect(toggleStrikethrough(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("del")).toHaveTextContent("world");
  });

  it("uses inline code as exclusive inline formatting", async () => {
    const mounted = await mountEditor("**Hello** world");

    setTextSelection(mounted.view, 1, 6);

    expect(toggleInlineCode(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("code")).toHaveTextContent("Hello");
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).toContain("`Hello` world");
  });

  it("applies inline formatting across selected blocks and arms collapsed empty formatting", async () => {
    const selectedBlocksEditor = await mountEditor(TWO_PARAGRAPH_MARKDOWN);

    expect(selectAll(selectedBlocksEditor.view)).toBe(true);
    expect(toggleStrong(selectedBlocksEditor.view)).toBe(true);

    expect(selectedBlocksEditor.view.dom.querySelectorAll("strong")).toHaveLength(2);
    expect(selectedBlocksEditor.getMarkdown()).toContain("**First**");
    expect(selectedBlocksEditor.getMarkdown()).toContain("**Second**");

    const collapsedEditor = await mountEditor("");

    setTextSelection(collapsedEditor.view, 1);

    expect(toggleEmphasis(collapsedEditor.view)).toBe(true);

    typeText(collapsedEditor.view, "empty");

    expect(getEditorTextContent(collapsedEditor)).toBe("*empty*");
    expect(collapsedEditor.getMarkdown()).toContain("*empty*");
  });

  it("clears selected and active inline formatting", async () => {
    const mounted = await mountEditor("**Hello** *world*");

    setTextSelection(mounted.view, 1, 6);

    expect(canClearInlineFormat(mounted.view.state)).toBe(true);
    expect(clearInlineFormat(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(mounted.view.dom.querySelector("em")).toHaveTextContent("world");

    setTextSelection(mounted.view, 8);

    expect(clearInlineFormat(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("em")).not.toBeInTheDocument();
  });
});
