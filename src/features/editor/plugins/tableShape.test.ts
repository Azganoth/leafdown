// @vitest-environment happy-dom

import type { MarkdownNode } from "@milkdown/kit/transformer";
import { describe, expect, it } from "vitest";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getTableCellTexts } from "@/test/utils/prosemirror";

import { matchTableRowsToHeader } from "./tableShape";

const mountEditor = setupMilkdownEditorMount();

const SHORT_ROW_MARKDOWN = "| A | B |\n| --- | --- |\n| one |\n";
const LONG_ROW_MARKDOWN = "| A | B |\n| --- | --- |\n| two | three | ignored |\n";
const RAGGED_MARKDOWN = "| A | B |\n| --- | --- |\n| one |\n| two | three | ignored |\n";
const RAGGED_HTML =
  "<table><tr><th>A</th><th>B</th></tr><tr><td>one</td></tr>" +
  "<tr><td>two</td><td>three</td><td>ignored</td></tr></table>";

const markdownCell = (value: string): MarkdownNode => ({
  type: "tableCell",
  children: [{ type: "text", value }],
});

const markdownRow = (...values: string[]): MarkdownNode => ({
  type: "tableRow",
  children: values.map(markdownCell),
});

const markdownTable = (...rows: MarkdownNode[]): MarkdownNode => ({
  type: "table",
  children: rows,
});

const markdownCellValues = (table: MarkdownNode) =>
  table.children?.map((row) =>
    row.children?.map((cell) => (cell.children?.[0]?.value as string | undefined) ?? ""),
  );

const saveAndReopen = async (markdown: string) => {
  const before = await mountEditor(markdown);
  const beforeDoc: unknown = before.view.state.doc.toJSON();

  const after = await mountEditor(before.getMarkdown());

  return [beforeDoc, after.view.state.doc.toJSON() as unknown];
};

describe("matchTableRowsToHeader", () => {
  it("fills a row that holds fewer cells than the header", () => {
    const table = markdownTable(markdownRow("A", "B"), markdownRow("one"));

    matchTableRowsToHeader(table);

    expect(markdownCellValues(table)).toEqual([
      ["A", "B"],
      ["one", ""],
    ]);
  });

  it("drops the cells a row holds beyond the header", () => {
    const table = markdownTable(markdownRow("A", "B"), markdownRow("two", "three", "ignored"));

    matchTableRowsToHeader(table);

    expect(markdownCellValues(table)).toEqual([
      ["A", "B"],
      ["two", "three"],
    ]);
  });

  it("leaves a table whose rows already match the header", () => {
    const table = markdownTable(markdownRow("A", "B"), markdownRow("one", "two"));
    const rows = table.children;

    matchTableRowsToHeader(table);

    expect(table.children).toBe(rows);
    expect(markdownCellValues(table)).toEqual([
      ["A", "B"],
      ["one", "two"],
    ]);
  });

  it("reaches a table nested in a container", () => {
    const table = markdownTable(markdownRow("A", "B"), markdownRow("one"));
    const tree: MarkdownNode = {
      type: "root",
      children: [{ type: "blockquote", children: [table] }],
    };

    matchTableRowsToHeader(tree);

    expect(markdownCellValues(table)).toEqual([
      ["A", "B"],
      ["one", ""],
    ]);
  });
});

describe("table shape plugin", () => {
  it.each([
    { name: "a row shorter than the header", markdown: SHORT_ROW_MARKDOWN, body: ["one", ""] },
    { name: "a row longer than the header", markdown: LONG_ROW_MARKDOWN, body: ["two", "three"] },
  ])("matches $name to the header on open", async ({ body, markdown }) => {
    const mounted = await mountEditor(markdown);

    expect(getTableCellTexts(mounted)).toEqual([["A", "B"], body]);
  });

  it("matches a row shorter than a wider header", async () => {
    const mounted = await mountEditor("| A | B | C |\n| --- | --- | --- |\n| one | two |\n");

    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B", "C"],
      ["one", "two", ""],
    ]);
  });

  it("takes the alignment of a filled cell from the column it joins", async () => {
    const mounted = await mountEditor("| A | B |\n| :-- | --: |\n| one |\n");

    expect(mounted.getMarkdown()).toBe("| A   |  B |\n| :-- | -: |\n| one |    |\n");
  });

  it.each([
    { markdown: SHORT_ROW_MARKDOWN, name: "a row shorter than the header" },
    { markdown: LONG_ROW_MARKDOWN, name: "a row longer than the header" },
    { markdown: RAGGED_MARKDOWN, name: "rows on both sides of the header" },
  ])("preserves the document across a save for $name", async ({ markdown }) => {
    const [beforeDoc, afterDoc] = await saveAndReopen(markdown);

    expect(afterDoc).toEqual(beforeDoc);
  });

  it("keeps a pasted ragged table in the columns it was written in", async () => {
    const mounted = await mountEditor("");

    dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: RAGGED_HTML,
      [TEXT_PLAIN_MIME_TYPE]: "one",
    });

    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["one", ""],
      ["two", "three"],
    ]);
  });

  it("matches every ragged table of one paste", async () => {
    const mounted = await mountEditor("");

    dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: `${RAGGED_HTML}${RAGGED_HTML}`,
      [TEXT_PLAIN_MIME_TYPE]: "one",
    });

    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["one", ""],
      ["two", "three"],
      ["A", "B"],
      ["one", ""],
      ["two", "three"],
    ]);
  });
});
