// @vitest-environment happy-dom

import { undo } from "@milkdown/kit/prose/history";
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
import { enterProjection } from "@/test/utils/sourceProjection";

import { getSelectableBlockTargets } from "../../plugins/blockSelection";
import { hasActiveSourceProjection } from "../../plugins/sourceProjection";
import { selectAll } from "../editing/selection";
import {
  IMAGE_MARKER,
  canInsertBlockAtBoundary,
  insertBlockAtBoundary,
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
  it("inserts before a root block at an explicit boundary as one undoable action", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    const second = getSelectableBlockTargets(mounted.view.state.doc)[1];
    expect(canInsertBlockAtBoundary(mounted.view.state, second.pos, "paragraph")).toBe(true);
    expect(insertBlockAtBoundary(mounted.view, second.pos, "paragraph")).toBe(true);
    expect([...mounted.view.dom.children].map((node) => node.tagName)).toEqual(["P", "P", "P"]);
    expect(mounted.view.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(undo(mounted.view.state, mounted.view.dispatch)).toBe(true);
    expect(mounted.getMarkdown()).toBe("First\n\nSecond\n");
  });

  it("creates a sibling list item at the nested list boundary", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n");
    const items = getSelectableBlockTargets(mounted.view.state.doc).filter(
      ({ node }) => node.type.name === "list_item",
    );
    const boundary = items[2].pos;
    expect(canInsertBlockAtBoundary(mounted.view.state, boundary, "paragraph")).toBe(false);
    expect(canInsertBlockAtBoundary(mounted.view.state, boundary, "listItem")).toBe(true);
    expect(insertBlockAtBoundary(mounted.view, boundary, "listItem")).toBe(true);
    expect(mounted.view.dom.querySelectorAll("li li")).toHaveLength(3);
    expect(mounted.view.state.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("keeps quote-child insertion inside the quote and table boundaries outside its cells", async () => {
    const quote = await mountEditor("> First\n>\n> Second\n");
    const quoteChildren = getSelectableBlockTargets(quote.view.state.doc).filter(
      ({ node }) => node.type.name === "paragraph",
    );
    expect(insertBlockAtBoundary(quote.view, quoteChildren[1].pos, "heading2")).toBe(true);
    expect(
      [...quote.view.dom.querySelector("blockquote")!.children].map((node) => node.tagName),
    ).toEqual(["P", "H2", "P"]);

    const table = await mountEditor("| A | B |\n| - | - |\n| C | D |\n");
    const target = getSelectableBlockTargets(table.view.state.doc)[0];
    expect(target.node.type.name).toBe("table");
    expect(canInsertBlockAtBoundary(table.view.state, target.pos, "paragraph")).toBe(true);
    expect(insertBlockAtBoundary(table.view, target.pos, "paragraph")).toBe(true);
    expect(table.view.dom.firstElementChild?.tagName).toBe("P");
    expect(table.view.dom.querySelectorAll("table")).toHaveLength(1);
  });

  it("commits active inline source before inserting at a later boundary", async () => {
    const mounted = await mountEditor("**Bold** plain\n\nSecond\n");
    enterProjection(mounted, "strong");
    const second = getSelectableBlockTargets(mounted.view.state.doc)[1];
    expect(insertBlockAtBoundary(mounted.view, second.pos, "paragraph")).toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.getMarkdown()).toBe("**Bold** plain\n\n\n\nSecond\n");
  });
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

  // A break read from a file writes the run it was authored with, so one the editor creates needs a
  // run of its own. Three asterisks are the spelling no position reads as anything but a break.
  it("writes an inserted horizontal rule with the default marker", async () => {
    const mounted = await mountEditor(TWO_PARAGRAPH_MARKDOWN);

    setTextSelection(mounted.view, 3);

    expect(insertHorizontalRule(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toContain("\n***\n");
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

  // A table read from a file writes the outer pipes it was authored with, so one the editor creates
  // needs a form of its own. Both pipes are the form every row reads back as the row it was
  // written from.
  it("writes an inserted table with the default outer pipes", async () => {
    const mounted = await mountEditor("First");

    setSelectionAtDocumentEnd(mounted.view);

    expect(insertTable(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).toContain("|    |    |\n| :- | :- |\n|    |    |\n");
  });
});
