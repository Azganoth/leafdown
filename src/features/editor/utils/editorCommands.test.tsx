import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Selection } from "@milkdown/kit/prose/state";
import { CellSelection, TableMap } from "@milkdown/kit/prose/tables";

import {
  setSelectionAtDocumentEnd,
  setSelectionAtTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

import { runEditorCommand } from "./editorCommands";

const mountedEditors: MountedMilkdownEditor[] = [];
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

const clipboard = {
  read: vi.fn<() => Promise<ClipboardItem[]>>(),
  readText: vi.fn<() => Promise<string>>(),
  write: vi.fn<(data: ClipboardItem[]) => Promise<void>>(),
  writeText: vi.fn<(text: string) => Promise<void>>(),
};

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  mountedEditors.push(mounted);
  return mounted;
};

const textContent = (mounted: MountedMilkdownEditor) => mounted.view.state.doc.textContent;
const getTextPosition = (mounted: MountedMilkdownEditor, text: string) => {
  const textRanges: { end: number; from: number; start: number }[] = [];
  let documentText = "";

  mounted.view.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }

    const start = documentText.length;
    documentText += node.textContent;
    textRanges.push({
      end: documentText.length,
      from: pos,
      start,
    });

    return true;
  });

  const index = documentText.indexOf(text);

  if (index === -1) {
    throw new Error(`Could not find text: ${text}`);
  }

  const range = textRanges.find(({ end, start }) => start <= index && index < end);

  if (!range) {
    throw new Error(`Could not resolve text position: ${text}`);
  }

  return range.from + index - range.start;
};
const textSelectionStart = 1;
const imageMarkerText = "![]()";
const tableMarkdown = "| A | B |\n| - | - |\n| C | D |\n| E | F |";

const createClipboardItem = (type: string, value: string): ClipboardItem =>
  ({
    types: [type],
    getType: vi.fn(async () => new Blob([value], { type })),
  }) as unknown as ClipboardItem;

const getFirstTable = (mounted: MountedMilkdownEditor) => {
  const tables: { node: ProseMirrorNode; start: number }[] = [];

  mounted.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") {
      return true;
    }

    tables.push({ node, start: pos + 1 });

    return false;
  });

  const table = tables[0];

  if (!table) {
    throw new Error("Expected a table in the mounted editor.");
  }

  return table;
};

const getTableCellPos = (mounted: MountedMilkdownEditor, row: number, col: number) => {
  const table = getFirstTable(mounted);

  return table.start + TableMap.get(table.node).positionAt(row, col, table.node);
};

const setSelectionInTableCell = (mounted: MountedMilkdownEditor, row: number, col: number) => {
  const cellPos = getTableCellPos(mounted, row, col);
  const selection = Selection.findFrom(mounted.view.state.doc.resolve(cellPos + 1), 1, true);

  if (!selection) {
    throw new Error("Could not place selection inside table cell.");
  }

  mounted.view.dispatch(mounted.view.state.tr.setSelection(selection));
};

const setTableCellSelection = (
  mounted: MountedMilkdownEditor,
  anchor: { row: number; col: number },
  head: { row: number; col: number },
) => {
  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(
      new CellSelection(
        mounted.view.state.doc.resolve(getTableCellPos(mounted, anchor.row, anchor.col)),
        mounted.view.state.doc.resolve(getTableCellPos(mounted, head.row, head.col)),
      ),
    ),
  );
};

const tableRowText = (mounted: MountedMilkdownEditor) =>
  Array.from(mounted.view.dom.querySelectorAll("tr")).map((row) => row.textContent ?? "");

describe("editor commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    clipboard.read.mockResolvedValue([]);
    clipboard.readText.mockResolvedValue("");
    clipboard.write.mockResolvedValue(undefined);
    clipboard.writeText.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));

    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("runs undo and redo through editor history", async () => {
    const mounted = await mountEditor("Hello");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");

    expect(textContent(mounted)).toBe("Hello!");

    expect(runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(textContent(mounted)).toBe("Hello");

    expect(runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(textContent(mounted)).toBe("Hello!");
  });

  it("deletes selections and words around the caret", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 3);

    expect(runEditorCommand(mounted.editor, "edit.delete")).toBe(true);
    expect(textContent(mounted)).toBe("Helo world");

    setTextSelection(mounted.view, 1, 5);

    expect(runEditorCommand(mounted.editor, "edit.delete")).toBe(true);
    expect(textContent(mounted)).toBe(" world");

    setSelectionAtDocumentEnd(mounted.view);

    expect(runEditorCommand(mounted.editor, "edit.deleteWordBackward")).toBe(true);
    expect(textContent(mounted)).toBe(" ");

    typeText(mounted.view, "Hello world");
    setTextSelection(mounted.view, 8);

    expect(runEditorCommand(mounted.editor, "edit.deleteWordForward")).toBe(true);
    expect(textContent(mounted)).toBe(" Hello ");
  });

  it("selects all content and the active word", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 3);

    expect(runEditorCommand(mounted.editor, "edit.selectWord")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);

    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(0);
    expect(mounted.view.state.selection.to).toBe(mounted.view.state.doc.content.size);
  });

  it("jumps to document and line boundaries", async () => {
    const mounted = await mountEditor("First\n\nSecond");

    setSelectionAtDocumentEnd(mounted.view);

    expect(runEditorCommand(mounted.editor, "edit.jumpToTop")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(textSelectionStart);

    expect(runEditorCommand(mounted.editor, "edit.jumpToBottom")).toBe(true);
    const documentEnd = mounted.view.state.selection.from;

    expect(documentEnd).toBeGreaterThan(textSelectionStart);

    expect(runEditorCommand(mounted.editor, "edit.jumpToLineStart")).toBe(true);
    expect(mounted.view.state.selection.from).toBeLessThan(documentEnd);

    expect(runEditorCommand(mounted.editor, "edit.jumpToLineEnd")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(documentEnd);
  });

  it("scrolls the active selection without changing it", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "edit.jumpToSelection")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);
  });

  it("copies selections in plain text and Markdown formats", async () => {
    const mounted = await mountEditor("**Bold** plain");

    setTextSelection(mounted.view, 1, 5);

    await expect(runEditorCommand(mounted.editor, "edit.copyAsPlainText")).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenLastCalledWith("Bold");

    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);

    await expect(runEditorCommand(mounted.editor, "edit.copyAsMarkdown")).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenLastCalledWith(expect.stringContaining("**Bold**"));
  });

  it("cuts the current selection after copying it", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    await expect(runEditorCommand(mounted.editor, "edit.cut")).resolves.toBe(true);

    expect(clipboard.writeText).toHaveBeenCalledWith("Hello");
    expect(textContent(mounted)).toBe(" world");
  });

  it("pastes plain text literally and Markdown as editor content", async () => {
    const plainTextEditor = await mountEditor("");

    clipboard.readText.mockResolvedValue("**Bold**");

    await expect(runEditorCommand(plainTextEditor.editor, "edit.pasteAsPlainText")).resolves.toBe(
      true,
    );

    expect(plainTextEditor.view.dom).toHaveTextContent("**Bold**");
    expect(plainTextEditor.view.dom.querySelector("strong")).not.toBeInTheDocument();

    const markdownEditor = await mountEditor("");

    clipboard.readText.mockResolvedValue("**Bold**");

    await expect(runEditorCommand(markdownEditor.editor, "edit.pasteAsMarkdown")).resolves.toBe(
      true,
    );

    expect(markdownEditor.view.dom).toHaveTextContent("**Bold**");
    expect(markdownEditor.view.dom.querySelector("strong")).toBeInTheDocument();
    expect(markdownEditor.getMarkdown()).toBe("**Bold**\n");
  });

  it("pastes rich text from clipboard HTML when available", async () => {
    const mounted = await mountEditor("");

    clipboard.read.mockResolvedValue([
      createClipboardItem("text/html", "<p><strong>Rich</strong> text</p>"),
    ]);

    await expect(runEditorCommand(mounted.editor, "edit.pasteAsRichText")).resolves.toBe(true);

    expect(mounted.view.dom).toHaveTextContent("Rich text");
    expect(mounted.view.dom.querySelector("strong")).toBeInTheDocument();
  });

  it.each([
    "edit.paste",
    "edit.pasteAsPlainText",
    "edit.pasteAsMarkdown",
    "edit.pasteAsRichText",
  ] as const)(
    "pastes literal clipboard text inside active source projection for %s",
    async (commandId) => {
      const mounted = await mountEditor("**Bold** plain");
      const strong = mounted.view.dom.querySelector("strong");

      expect(strong).toBeInTheDocument();

      setSelectionAtTextEnd(mounted.view, strong as HTMLElement);

      const sourceStart = getTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);
      clipboard.read.mockResolvedValue([
        createClipboardItem("text/html", "<p><strong>Rich</strong></p>"),
      ]);
      clipboard.readText.mockResolvedValue("*Paste*");

      await expect(runEditorCommand(mounted.editor, commandId)).resolves.toBe(true);

      expect(textContent(mounted)).toBe("***Paste*** plain");

      setSelectionAtDocumentEnd(mounted.view);
      expect(mounted.getMarkdown()).toBe("***Paste*** plain\n");
    },
  );

  it("toggles inline formatting for selections and nearest words", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "format.strong")).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("Hello");
    expect(mounted.getMarkdown()).toContain("**Hello** world");

    expect(runEditorCommand(mounted.editor, "format.strong")).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();

    setTextSelection(mounted.view, 8);

    expect(runEditorCommand(mounted.editor, "format.emphasis")).toBe(true);
    expect(mounted.view.state.doc.textContent).toContain("*world*");
    expect(mounted.getMarkdown()).toContain("*world*");

    expect(runEditorCommand(mounted.editor, "format.strikethrough")).toBe(true);
    expect(mounted.view.dom.querySelector("del")).toHaveTextContent("world");
  });

  it("uses inline code as exclusive inline formatting", async () => {
    const mounted = await mountEditor("**Hello** world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "format.inlineCode")).toBe(true);
    expect(mounted.view.dom.querySelector("code")).toHaveTextContent("Hello");
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).toContain("`Hello` world");
  });

  it("applies inline formatting across selected blocks and arms collapsed empty formatting", async () => {
    const selectedBlocksEditor = await mountEditor("First\n\nSecond");

    expect(runEditorCommand(selectedBlocksEditor.editor, "edit.selectAll")).toBe(true);
    expect(runEditorCommand(selectedBlocksEditor.editor, "format.strong")).toBe(true);

    expect(selectedBlocksEditor.view.dom.querySelectorAll("strong")).toHaveLength(2);
    expect(selectedBlocksEditor.getMarkdown()).toContain("**First**");
    expect(selectedBlocksEditor.getMarkdown()).toContain("**Second**");

    const collapsedEditor = await mountEditor("");

    setTextSelection(collapsedEditor.view, 1);

    expect(runEditorCommand(collapsedEditor.editor, "format.emphasis")).toBe(true);

    typeText(collapsedEditor.view, "empty");

    expect(collapsedEditor.view.state.doc.textContent).toBe("*empty*");
    expect(collapsedEditor.getMarkdown()).toContain("*empty*");
  });

  it("clears selected and active inline formatting", async () => {
    const mounted = await mountEditor("**Hello** *world*");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "format.clearInline")).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(mounted.view.dom.querySelector("em")).toHaveTextContent("world");

    setTextSelection(mounted.view, 8);

    expect(runEditorCommand(mounted.editor, "format.clearInline")).toBe(true);
    expect(mounted.view.dom.querySelector("em")).not.toBeInTheDocument();
  });

  it("inserts raw link markers around selections and at collapsed carets", async () => {
    const selectedLinkEditor = await mountEditor("Hello");

    setTextSelection(selectedLinkEditor.view, 1, 6);

    expect(runEditorCommand(selectedLinkEditor.editor, "insert.link")).toBe(true);
    expect(textContent(selectedLinkEditor)).toBe("[Hello]()");
    expect(selectedLinkEditor.view.dom.querySelector("a")).not.toBeInTheDocument();
    expect(selectedLinkEditor.view.state.selection.from).toBe(9);

    const wordLinkEditor = await mountEditor("Hello");

    setTextSelection(wordLinkEditor.view, 3);

    expect(runEditorCommand(wordLinkEditor.editor, "insert.link")).toBe(true);
    expect(textContent(wordLinkEditor)).toBe("He[]()llo");
    expect(wordLinkEditor.view.state.selection.from).toBe(4);

    const emptyLinkEditor = await mountEditor("");

    setTextSelection(emptyLinkEditor.view, 1);

    expect(runEditorCommand(emptyLinkEditor.editor, "insert.link")).toBe(true);
    expect(textContent(emptyLinkEditor)).toBe("[]()");
    expect(emptyLinkEditor.view.state.selection.from).toBe(2);
  });

  it("inserts block content after the current block", async () => {
    const cases = [
      { commandId: "insert.heading2", tags: ["p", "h2", "p"] },
      { commandId: "insert.blockquote", tags: ["p", "blockquote", "p"] },
      { commandId: "insert.codeBlock", tags: ["p", "pre", "p"] },
      { commandId: "insert.horizontalRule", tags: ["p", "hr", "p", "p"] },
    ] as const;

    for (const { commandId, tags } of cases) {
      const mounted = await mountEditor("First\n\nSecond");

      setTextSelection(mounted.view, 3);

      expect(runEditorCommand(mounted.editor, commandId)).toBe(true);

      const blocks = Array.from(mounted.view.dom.children);

      expect(blocks.map((block) => block.tagName.toLowerCase())).toEqual(tags);
      expect(blocks[0]).toHaveTextContent("First");
      expect(blocks.at(-1)).toHaveTextContent("Second");
    }
  });

  it("inserts after the selected block range without replacing selected content", async () => {
    const mounted = await mountEditor("First\n\nSecond");

    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);
    expect(runEditorCommand(mounted.editor, "insert.paragraph")).toBe(true);

    expect(mounted.view.dom.querySelectorAll("p")).toHaveLength(3);
    expect(mounted.view.dom).toHaveTextContent("First");
    expect(mounted.view.dom).toHaveTextContent("Second");
  });

  it("inserts after the nearest nested block when the schema allows it", async () => {
    const quoteEditor = await mountEditor("> First\n>\n> Second");
    const firstQuoteParagraph = quoteEditor.view.dom.querySelector("blockquote p");

    expect(firstQuoteParagraph).toBeInTheDocument();

    setSelectionAtTextEnd(quoteEditor.view, firstQuoteParagraph as HTMLParagraphElement);

    expect(runEditorCommand(quoteEditor.editor, "insert.heading2")).toBe(true);

    const quoteBlocks = Array.from(
      quoteEditor.view.dom.querySelector("blockquote")?.children ?? [],
    );

    expect(quoteBlocks.map((block) => block.tagName.toLowerCase())).toEqual(["p", "h2", "p"]);
    expect(quoteBlocks[0]).toHaveTextContent("First");
    expect(quoteBlocks[2]).toHaveTextContent("Second");
  });

  it("keeps inserted paragraphs inside the active list item", async () => {
    const mounted = await mountEditor("- First\n- Second");
    const firstListItem = mounted.view.dom.querySelector("li");

    expect(firstListItem).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, firstListItem as HTMLLIElement);

    expect(runEditorCommand(mounted.editor, "insert.paragraph")).toBe(true);

    const listItems = mounted.view.dom.querySelectorAll("li");

    expect(listItems).toHaveLength(2);
    expect(listItems[0]?.querySelectorAll("p")).toHaveLength(2);
    expect(listItems[0]).toHaveTextContent("First");
    expect(listItems[1]).toHaveTextContent("Second");
  });

  it("inserts image Markdown with the caret inside the target", async () => {
    const mounted = await mountEditor("First");

    setSelectionAtDocumentEnd(mounted.view);

    expect(runEditorCommand(mounted.editor, "insert.image")).toBe(true);
    expect(textContent(mounted)).toBe("First![]()");
    expect(mounted.view.state.selection.$from.parent.textContent).toBe(imageMarkerText);
    expect(mounted.view.state.selection.$from.parentOffset).toBe(4);
  });

  it("inserts list blocks with MVP list variants", async () => {
    const orderedListEditor = await mountEditor("First");

    setSelectionAtDocumentEnd(orderedListEditor.view);

    expect(runEditorCommand(orderedListEditor.editor, "insert.orderedList")).toBe(true);
    expect(orderedListEditor.view.dom.querySelector("ol li")).toBeInTheDocument();

    const unorderedListEditor = await mountEditor("First");

    setSelectionAtDocumentEnd(unorderedListEditor.view);

    expect(runEditorCommand(unorderedListEditor.editor, "insert.unorderedList")).toBe(true);
    expect(unorderedListEditor.view.dom.querySelector("ul li")).toBeInTheDocument();

    const taskListEditor = await mountEditor("First");

    setSelectionAtDocumentEnd(taskListEditor.view);

    expect(runEditorCommand(taskListEditor.editor, "insert.taskList")).toBe(true);
    expect(taskListEditor.view.dom.querySelector("li[data-checked='false']")).toBeInTheDocument();
  });

  it("inserts a default 2-by-2 table", async () => {
    const mounted = await mountEditor("First");

    setSelectionAtDocumentEnd(mounted.view);

    expect(runEditorCommand(mounted.editor, "insert.table")).toBe(true);

    const table = mounted.view.dom.querySelector("table");

    expect(table).toBeInTheDocument();
    expect(table?.querySelectorAll("tr")).toHaveLength(2);
    expect(table?.querySelectorAll("th, td")).toHaveLength(4);
  });

  it("adds and deletes table rows and columns from the active cell", async () => {
    const mounted = await mountEditor(tableMarkdown);

    setSelectionInTableCell(mounted, 1, 0);

    expect(runEditorCommand(mounted.editor, "format.table.addRowBelow")).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(4);

    expect(runEditorCommand(mounted.editor, "format.table.addColumnAfter")).toBe(true);
    expect(mounted.view.dom.querySelector("tr")?.querySelectorAll("th, td")).toHaveLength(3);

    expect(runEditorCommand(mounted.editor, "format.table.deleteColumn")).toBe(true);
    expect(mounted.view.dom.querySelector("tr")?.querySelectorAll("th, td")).toHaveLength(2);

    expect(runEditorCommand(mounted.editor, "format.table.deleteRow")).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(3);
  });

  it("keeps table header rows protected for row commands", async () => {
    const mounted = await mountEditor(tableMarkdown);
    const firstHeaderCell = mounted.view.dom.querySelector("th");

    expect(firstHeaderCell).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, firstHeaderCell as HTMLTableCellElement);

    expect(runEditorCommand(mounted.editor, "format.table.addRowAbove")).toBe(false);
    expect(runEditorCommand(mounted.editor, "format.table.moveRowUp")).toBe(false);
    expect(runEditorCommand(mounted.editor, "format.table.moveRowDown")).toBe(false);
    expect(runEditorCommand(mounted.editor, "format.table.deleteRow")).toBe(false);
    expect(tableRowText(mounted)).toEqual(["AB", "CD", "EF"]);

    expect(runEditorCommand(mounted.editor, "format.table.addRowBelow")).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(4);
    expect(tableRowText(mounted).slice(0, 2)).toEqual(["AB", ""]);
  });

  it("moves table rows and columns when a destination exists", async () => {
    const mounted = await mountEditor(tableMarkdown);

    setSelectionInTableCell(mounted, 1, 0);

    expect(runEditorCommand(mounted.editor, "format.table.moveRowDown")).toBe(true);
    expect(tableRowText(mounted)).toEqual(["AB", "EF", "CD"]);

    expect(runEditorCommand(mounted.editor, "format.table.moveRowUp")).toBe(true);
    expect(tableRowText(mounted)).toEqual(["AB", "CD", "EF"]);

    setSelectionInTableCell(mounted, 1, 0);

    expect(runEditorCommand(mounted.editor, "format.table.moveColumnRight")).toBe(true);
    expect(tableRowText(mounted)).toEqual(["BA", "DC", "FE"]);

    expect(runEditorCommand(mounted.editor, "format.table.moveColumnLeft")).toBe(true);
    expect(tableRowText(mounted)).toEqual(["AB", "CD", "EF"]);
  });

  it("uses selected table ranges for table deletion commands", async () => {
    const rowDeletionEditor = await mountEditor("| A | B |\n| - | - |\n| C | D |");

    setTableCellSelection(rowDeletionEditor, { row: 1, col: 0 }, { row: 1, col: 1 });

    expect(runEditorCommand(rowDeletionEditor.editor, "format.table.deleteRow")).toBe(true);
    expect(rowDeletionEditor.view.dom.querySelector("table")).not.toBeInTheDocument();

    const columnDeletionEditor = await mountEditor(tableMarkdown);

    setTableCellSelection(columnDeletionEditor, { row: 0, col: 0 }, { row: 2, col: 1 });

    expect(runEditorCommand(columnDeletionEditor.editor, "format.table.deleteColumn")).toBe(true);
    expect(columnDeletionEditor.view.dom.querySelector("table")).not.toBeInTheDocument();
  });

  it("deletes the active table", async () => {
    const mounted = await mountEditor(tableMarkdown);

    setSelectionInTableCell(mounted, 1, 0);

    expect(runEditorCommand(mounted.editor, "format.table.delete")).toBe(true);
    expect(mounted.view.dom.querySelector("table")).not.toBeInTheDocument();
  });

  it("toggles paragraph, heading, blockquote, and code block formats", async () => {
    const mounted = await mountEditor("Hello");

    setTextSelection(mounted.view, 3);

    expect(runEditorCommand(mounted.editor, "format.heading2")).toBe(true);
    expect(mounted.view.dom.querySelector("h2")).toHaveTextContent("Hello");
    expect(mounted.getMarkdown()).toContain("## Hello");

    expect(runEditorCommand(mounted.editor, "format.heading2")).toBe(true);
    expect(mounted.view.dom.querySelector("h2")).not.toBeInTheDocument();

    expect(runEditorCommand(mounted.editor, "format.blockquote")).toBe(true);
    expect(mounted.view.dom.querySelector("blockquote")).toHaveTextContent("Hello");

    expect(runEditorCommand(mounted.editor, "format.clearBlock")).toBe(true);
    expect(mounted.view.dom.querySelector("blockquote")).not.toBeInTheDocument();

    expect(runEditorCommand(mounted.editor, "format.codeBlock")).toBe(true);
    expect(mounted.view.dom.querySelector("pre code")).toHaveTextContent("Hello");

    expect(runEditorCommand(mounted.editor, "format.paragraph")).toBe(true);
    expect(mounted.view.dom.querySelector("pre code")).not.toBeInTheDocument();
  });

  it("adjusts heading levels for selected heading blocks", async () => {
    const mounted = await mountEditor("# First\n\n### Second");

    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);
    expect(runEditorCommand(mounted.editor, "format.increaseHeading")).toBe(true);

    expect(mounted.getMarkdown()).toContain("## First");
    expect(mounted.getMarkdown()).toContain("#### Second");

    expect(runEditorCommand(mounted.editor, "format.decreaseHeading")).toBe(true);
    expect(mounted.getMarkdown()).toContain("# First");
    expect(mounted.getMarkdown()).toContain("### Second");
  });

  it("toggles list and task list formats", async () => {
    const mounted = await mountEditor("Item");

    setTextSelection(mounted.view, 2);

    expect(runEditorCommand(mounted.editor, "format.unorderedList")).toBe(true);
    expect(mounted.view.dom.querySelector("ul li")).toHaveTextContent("Item");

    expect(runEditorCommand(mounted.editor, "format.taskList")).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked='false']")).toHaveTextContent("Item");
    expect(mounted.getMarkdown()).toContain("* [ ] Item");

    expect(runEditorCommand(mounted.editor, "format.toggleTaskChecked")).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked='true']")).toHaveTextContent("Item");
    expect(mounted.getMarkdown()).toContain("* [x] Item");

    expect(runEditorCommand(mounted.editor, "format.taskList")).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked]")).not.toBeInTheDocument();
  });

  it("indents and outdents list items through formatting commands", async () => {
    const mounted = await mountEditor("- First\n- Second");
    const listItems = mounted.view.dom.querySelectorAll("li");

    expect(listItems).toHaveLength(2);

    setTextSelection(mounted.view, mounted.view.posAtDOM(listItems[1], 0));

    expect(runEditorCommand(mounted.editor, "format.increaseListIndent")).toBe(true);
    expect(mounted.view.dom.querySelectorAll("ul ul li")).toHaveLength(1);

    expect(runEditorCommand(mounted.editor, "format.decreaseListIndent")).toBe(true);
    expect(mounted.view.dom.querySelectorAll("ul > li")).toHaveLength(2);
  });

  it("toggles rendered task checkboxes by clicking their checkbox area", async () => {
    const mounted = await mountEditor("- [ ] Todo");
    const taskListItem = mounted.view.dom.querySelector("li[data-checked='false']");

    expect(taskListItem).toBeInTheDocument();

    taskListItem?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 1,
        clientY: 1,
      }),
    );

    expect(mounted.view.dom.querySelector("li[data-checked='true']")).toHaveTextContent("Todo");
    expect(mounted.getMarkdown()).toContain("* [x] Todo");
  });
});
