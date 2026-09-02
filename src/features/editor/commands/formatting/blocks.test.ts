// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { MIXED_HEADING_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setTextSelection } from "@/test/utils/prosemirror";

import { selectAll } from "../editing/selection";
import {
  canDecreaseListIndent,
  canIncreaseListIndent,
  clearBlockFormat,
  decreaseListIndent,
  decreaseHeadingLevel,
  canChangeHeadingLevel,
  canClearBlockFormat,
  increaseListIndent,
  increaseHeadingLevel,
  setParagraph,
  toggleBlockquote,
  toggleCodeBlock,
  toggleHeading,
  toggleTaskChecked,
  toggleTaskList,
  toggleUnorderedList,
} from "./blocks";

const mountEditor = setupMilkdownEditorMount();

describe("editor block formatting commands", () => {
  it("toggles paragraph, heading, blockquote, and code block formats", async () => {
    const mounted = await mountEditor("Hello");

    setTextSelection(mounted.view, 3);

    expect(canClearBlockFormat(mounted.view.state)).toBe(false);
    expect(toggleHeading(mounted.view, 2)).toBe(true);
    expect(canClearBlockFormat(mounted.view.state)).toBe(true);
    expect(mounted.view.dom.querySelector("h2")).toHaveTextContent("Hello");
    expect(mounted.getMarkdown()).toContain("## Hello");

    expect(toggleHeading(mounted.view, 2)).toBe(true);
    expect(mounted.view.dom.querySelector("h2")).not.toBeInTheDocument();

    expect(toggleBlockquote(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("blockquote")).toHaveTextContent("Hello");

    expect(clearBlockFormat(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("blockquote")).not.toBeInTheDocument();

    expect(toggleCodeBlock(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("pre code")).toHaveTextContent("Hello");

    expect(setParagraph(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("pre code")).not.toBeInTheDocument();
  });

  it("adjusts heading levels for selected heading blocks", async () => {
    const mounted = await mountEditor(MIXED_HEADING_MARKDOWN);

    expect(selectAll(mounted.view)).toBe(true);
    expect(canChangeHeadingLevel(mounted.view.state, -1)).toBe(true);
    expect(canChangeHeadingLevel(mounted.view.state, 1)).toBe(true);
    expect(increaseHeadingLevel(mounted.view)).toBe(true);

    expect(mounted.getMarkdown()).toContain("## First");
    expect(mounted.getMarkdown()).toContain("#### Second");

    expect(decreaseHeadingLevel(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toContain("# First");
    expect(mounted.getMarkdown()).toContain("### Second");
  });

  it("toggles list and task list formats", async () => {
    const mounted = await mountEditor("Item");

    setTextSelection(mounted.view, 2);

    expect(toggleUnorderedList(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("ul li")).toHaveTextContent("Item");

    expect(toggleTaskList(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked='false']")).toHaveTextContent("Item");
    expect(mounted.getMarkdown()).toContain("* [ ] Item");

    expect(toggleTaskChecked(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked='true']")).toHaveTextContent("Item");
    expect(mounted.getMarkdown()).toContain("* [x] Item");

    expect(toggleTaskList(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked]")).not.toBeInTheDocument();
  });

  it("indents and outdents list items through formatting commands", async () => {
    const mounted = await mountEditor("- First\n- Second");
    const listItems = mounted.view.dom.querySelectorAll("li");

    expect(listItems).toHaveLength(2);

    setTextSelection(mounted.view, mounted.view.posAtDOM(listItems[1], 0));

    expect(canIncreaseListIndent(mounted.view.state)).toBe(true);
    expect(increaseListIndent(mounted.view)).toBe(true);
    expect(canDecreaseListIndent(mounted.view.state)).toBe(true);
    expect(canIncreaseListIndent(mounted.view.state)).toBe(false);
    expect(mounted.view.dom.querySelectorAll("ul ul li")).toHaveLength(1);

    expect(decreaseListIndent(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelectorAll("ul > li")).toHaveLength(2);
  });

  // A code block's own toggle is the command that removes it, and an info string is not a second
  // kind of code block. The saved bytes are asserted beside the node because a toggle that only
  // deleted the info string left a file the language alone tells from the one a working toggle
  // writes.
  it.each(["```ts\nconst a = 1;\n```\n", "```\nconst a = 1;\n```\n"])(
    "toggles the code block in %j off whatever its info string",
    async (source) => {
      const mounted = await mountEditor(source);

      setTextSelection(mounted.view, 3);

      expect(toggleCodeBlock(mounted.view)).toBe(true);
      expect(mounted.view.state.doc.child(0).type.name).toBe("paragraph");
      expect(mounted.getMarkdown()).toBe("const a = 1;\n");
    },
  );

  // One command reaches every block in the selection, so a paragraph beside a code block gains the
  // format while the block that already carries one keeps the language it holds.
  it("keeps a code block's info string where the same command reaches a paragraph beside it", async () => {
    const mounted = await mountEditor("Paragraph\n\n```ts\nconst a = 1;\n```\n");

    expect(selectAll(mounted.view)).toBe(true);
    expect(toggleCodeBlock(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toBe("```\nParagraph\n```\n\n```ts\nconst a = 1;\n```\n");
  });
});
