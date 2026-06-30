import { describe, expect, it } from "vitest";

import { TWO_PARAGRAPH_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { selectAll } from "../editing/selection";
import {
  IMAGE_MARKER,
  insertBlockquote,
  insertCodeBlock,
  insertHeading,
  insertHorizontalRule,
  insertImage,
  insertOrderedList,
  insertParagraph,
  insertTable,
  insertTaskList,
  insertUnorderedList,
} from "./blocks";

const mountEditor = setupMilkdownEditorMount();

describe("editor block insertion commands", () => {
  it("inserts block content after the current block", async () => {
    const cases = [
      {
        insert: (view: Parameters<typeof insertHeading>[0]) => insertHeading(view, 2),
        tags: ["p", "h2", "p"],
      },
      { insert: insertBlockquote, tags: ["p", "blockquote", "p"] },
      { insert: insertCodeBlock, tags: ["p", "pre", "p"] },
      { insert: insertHorizontalRule, tags: ["p", "hr", "p", "p"] },
    ] as const;

    for (const { insert, tags } of cases) {
      const mounted = await mountEditor(TWO_PARAGRAPH_MARKDOWN);

      setTextSelection(mounted.view, 3);

      expect(insert(mounted.view)).toBe(true);

      const blocks = Array.from(mounted.view.dom.children);

      expect(blocks.map((block) => block.tagName.toLowerCase())).toEqual(tags);
      expect(blocks[0]).toHaveTextContent("First");
      expect(blocks.at(-1)).toHaveTextContent("Second");
    }
  });

  it("inserts after the selected block range without replacing selected content", async () => {
    const mounted = await mountEditor(TWO_PARAGRAPH_MARKDOWN);

    expect(selectAll(mounted.view)).toBe(true);
    expect(insertParagraph(mounted.view)).toBe(true);

    expect(mounted.view.dom.querySelectorAll("p")).toHaveLength(3);
    expect(mounted.view.dom).toHaveTextContent("First");
    expect(mounted.view.dom).toHaveTextContent("Second");
  });

  it("inserts after the nearest nested block when the schema allows it", async () => {
    const quoteEditor = await mountEditor("> First\n>\n> Second");
    const firstQuoteParagraph = getEditorDomElement(quoteEditor, "blockquote p");

    setSelectionAtElementTextEnd(quoteEditor.view, firstQuoteParagraph);

    expect(insertHeading(quoteEditor.view, 2)).toBe(true);

    const quoteBlocks = Array.from(
      quoteEditor.view.dom.querySelector("blockquote")?.children ?? [],
    );

    expect(quoteBlocks.map((block) => block.tagName.toLowerCase())).toEqual(["p", "h2", "p"]);
    expect(quoteBlocks[0]).toHaveTextContent("First");
    expect(quoteBlocks[2]).toHaveTextContent("Second");
  });

  it("keeps inserted paragraphs inside the active list item", async () => {
    const mounted = await mountEditor("- First\n- Second");
    const firstListItem = getEditorDomElement(mounted, "li");

    setSelectionAtElementTextEnd(mounted.view, firstListItem);

    expect(insertParagraph(mounted.view)).toBe(true);

    const listItems = mounted.view.dom.querySelectorAll("li");

    expect(listItems).toHaveLength(2);
    expect(listItems[0]?.querySelectorAll("p")).toHaveLength(2);
    expect(listItems[0]).toHaveTextContent("First");
    expect(listItems[1]).toHaveTextContent("Second");
  });

  it("inserts image Markdown with the caret inside the target", async () => {
    const mounted = await mountEditor("First");

    setSelectionAtDocumentEnd(mounted.view);

    expect(insertImage(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`First${IMAGE_MARKER}`);
    expect(mounted.view.state.selection.$from.parent.textContent).toBe(IMAGE_MARKER);
    expect(mounted.view.state.selection.$from.parentOffset).toBe(4);
  });

  it("inserts list blocks with MVP list variants", async () => {
    const orderedListEditor = await mountEditor("First");

    setSelectionAtDocumentEnd(orderedListEditor.view);

    expect(insertOrderedList(orderedListEditor.view)).toBe(true);
    expect(orderedListEditor.view.dom.querySelector("ol li")).toBeInTheDocument();

    const unorderedListEditor = await mountEditor("First");

    setSelectionAtDocumentEnd(unorderedListEditor.view);

    expect(insertUnorderedList(unorderedListEditor.view)).toBe(true);
    expect(unorderedListEditor.view.dom.querySelector("ul li")).toBeInTheDocument();

    const taskListEditor = await mountEditor("First");

    setSelectionAtDocumentEnd(taskListEditor.view);

    expect(insertTaskList(taskListEditor.view)).toBe(true);
    expect(taskListEditor.view.dom.querySelector("li[data-checked='false']")).toBeInTheDocument();
  });

  it("inserts a default 2-by-2 table", async () => {
    const mounted = await mountEditor("First");

    setSelectionAtDocumentEnd(mounted.view);

    expect(insertTable(mounted.view)).toBe(true);

    const table = getEditorDomElement(mounted, "table");

    expect(table.querySelectorAll("tr")).toHaveLength(2);
    expect(table.querySelectorAll("th, td")).toHaveLength(4);
  });
});
