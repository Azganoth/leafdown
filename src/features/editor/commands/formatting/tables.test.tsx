import { describe, expect, it } from "vitest";

import { BASIC_TABLE_MARKDOWN, EXTENDED_TABLE_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getTableCellTexts,
  setSelectionAtElementTextEnd,
  setSelectionInTableCell,
  setTableCellSelection,
} from "@/test/utils/prosemirror";

import {
  addColumnAfter,
  addRowAbove,
  addRowBelow,
  canAddRowAbove,
  canAddRowBelow,
  canDeleteRows,
  canMoveColumns,
  canMoveRows,
  canUseTable,
  deleteColumns,
  deleteRows,
  deleteTable,
  moveColumnLeft,
  moveColumnRight,
  moveRowDown,
  moveRowUp,
} from "./tables";

const mountEditor = setupMilkdownEditorMount();

describe("editor table formatting commands", () => {
  it("adds and deletes table rows and columns from the active cell", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 0);

    expect(canUseTable(mounted.view.state)).toBe(true);
    expect(canAddRowBelow(mounted.view.state)).toBe(true);
    expect(canDeleteRows(mounted.view.state)).toBe(true);
    expect(canMoveColumns(mounted.view.state, 1)).toBe(true);
    expect(canMoveRows(mounted.view.state, 1)).toBe(true);
    expect(canMoveRows(mounted.view.state, -1)).toBe(false);
    expect(addRowBelow(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(4);

    expect(addColumnAfter(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("tr")?.querySelectorAll("th, td")).toHaveLength(3);

    expect(deleteColumns(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("tr")?.querySelectorAll("th, td")).toHaveLength(2);

    expect(deleteRows(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(3);
  });

  it("keeps table header rows protected for row commands", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);
    const firstHeaderCell = getEditorDomElement(mounted, "th");

    setSelectionAtElementTextEnd(mounted.view, firstHeaderCell);

    expect(canAddRowAbove(mounted.view.state)).toBe(false);
    expect(canAddRowBelow(mounted.view.state)).toBe(true);
    expect(canDeleteRows(mounted.view.state)).toBe(false);
    expect(canMoveRows(mounted.view.state, -1)).toBe(false);
    expect(canMoveRows(mounted.view.state, 1)).toBe(false);
    expect(addRowAbove(mounted.view)).toBe(false);
    expect(moveRowUp(mounted.view)).toBe(false);
    expect(moveRowDown(mounted.view)).toBe(false);
    expect(deleteRows(mounted.view)).toBe(false);
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["C", "D"],
      ["E", "F"],
    ]);

    expect(addRowBelow(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(4);
    expect(getTableCellTexts(mounted).slice(0, 2)).toEqual([
      ["A", "B"],
      ["", ""],
    ]);
  });

  it("moves table rows and columns when a destination exists", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 0);

    expect(moveRowDown(mounted.view)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["E", "F"],
      ["C", "D"],
    ]);

    expect(moveRowUp(mounted.view)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["C", "D"],
      ["E", "F"],
    ]);

    setSelectionInTableCell(mounted, 1, 0);

    expect(moveColumnRight(mounted.view)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["B", "A"],
      ["D", "C"],
      ["F", "E"],
    ]);

    expect(moveColumnLeft(mounted.view)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["C", "D"],
      ["E", "F"],
    ]);
  });

  it("uses selected table ranges for table deletion commands", async () => {
    const rowDeletionEditor = await mountEditor(BASIC_TABLE_MARKDOWN);

    setTableCellSelection(rowDeletionEditor, { row: 1, col: 0 }, { row: 1, col: 1 });

    expect(deleteRows(rowDeletionEditor.view)).toBe(true);
    expect(rowDeletionEditor.view.dom.querySelector("table")).not.toBeInTheDocument();

    const columnDeletionEditor = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    setTableCellSelection(columnDeletionEditor, { row: 0, col: 0 }, { row: 2, col: 1 });

    expect(deleteColumns(columnDeletionEditor.view)).toBe(true);
    expect(columnDeletionEditor.view.dom.querySelector("table")).not.toBeInTheDocument();
  });

  it("deletes the active table", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 0);

    expect(deleteTable(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("table")).not.toBeInTheDocument();
  });
});
