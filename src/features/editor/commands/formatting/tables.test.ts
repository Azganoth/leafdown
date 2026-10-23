// @vitest-environment happy-dom

import { CellSelection, selectedRect } from "@milkdown/kit/prose/tables";
import { describe, expect, it } from "vitest";

import {
  BASIC_TABLE_MARKDOWN,
  EXTENDED_TABLE_MARKDOWN,
  HEADER_ONLY_TABLE_MARKDOWN,
} from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getTableCellTexts,
  setSelectionAtElementTextEnd,
  setSelectionInTableCell,
  selectTableCellRange,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { getEditorCommandState, runEditorCommand } from "..";
import {
  addColumnAfter,
  addRowAbove,
  addRowBelow,
  canAddRowAbove,
  canAddRowBelow,
  canMoveTableColumnsTo,
  canMoveTableRowsTo,
  canDeleteRows,
  canMoveColumns,
  canMoveRows,
  canUseTable,
  deleteColumns,
  deleteRows,
  deleteTable,
  getTableColumnAlignment,
  insertTableColumnAt,
  insertTableRowAt,
  moveColumnLeft,
  moveColumnRight,
  moveRowDown,
  moveRowUp,
  moveTableColumnsTo,
  moveTableRowsTo,
  setTableColumnAlignment,
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

    selectTableCellRange(rowDeletionEditor, { row: 1, col: 0 }, { row: 1, col: 1 });

    expect(deleteRows(rowDeletionEditor.view)).toBe(true);
    expect(rowDeletionEditor.view.dom.querySelector("table")).not.toBeInTheDocument();

    const columnDeletionEditor = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    selectTableCellRange(columnDeletionEditor, { row: 0, col: 0 }, { row: 2, col: 1 });

    expect(deleteColumns(columnDeletionEditor.view)).toBe(true);
    expect(columnDeletionEditor.view.dom.querySelector("table")).not.toBeInTheDocument();
  });

  it("deletes the active table", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 0);

    expect(deleteTable(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("table")).not.toBeInTheDocument();
  });

  it("adds the first body row of a header-only table from its header", async () => {
    const mounted = await mountEditor(HEADER_ONLY_TABLE_MARKDOWN);

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "th"));

    expect(canAddRowBelow(mounted.view.state)).toBe(true);
    expect(addRowBelow(mounted.view)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["", ""],
    ]);
  });

  // A header-only table is a shape the editor can now open, but deleting the last body row still
  // removes the table rather than producing one. Changing that is a command decision this fix
  // does not take.
  it("removes a table whose only body row is deleted", async () => {
    const mounted = await mountEditor(BASIC_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 0);

    expect(deleteRows(mounted.view)).toBe(true);
    expect(mounted.view.dom.querySelector("table")).not.toBeInTheDocument();
  });

  it("inserts rows and columns at inner and end boundaries of a table", async () => {
    const mounted = await mountEditor(BASIC_TABLE_MARKDOWN);

    expect(insertTableRowAt(mounted.view, 0, 0)).toBe(false);
    expect(insertTableRowAt(mounted.view, 0, 1)).toBe(true);
    expect(insertTableRowAt(mounted.view, 0, 3)).toBe(true);
    expect(insertTableColumnAt(mounted.view, 0, 0)).toBe(true);
    expect(insertTableColumnAt(mounted.view, 0, 2)).toBe(true);
    expect(insertTableColumnAt(mounted.view, 0, 4)).toBe(true);
    expect(insertTableColumnAt(mounted.view, 0, 6)).toBe(false);
    expect(getTableCellTexts(mounted)).toEqual([
      ["", "A", "", "B", ""],
      ["", "", "", "", ""],
      ["", "C", "", "D", ""],
      ["", "", "", "", ""],
    ]);
    expect(mounted.view.dom.querySelectorAll("tr:first-child > th")).toHaveLength(5);
  });

  it("moves row and column ranges to a boundary as one undoable change", async () => {
    const mounted = await mountEditor("| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |");
    const original = mounted.getMarkdown();

    expect(moveTableRowsTo(mounted.view, 0, { from: 1, to: 2 }, 4)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["3", "4"],
      ["5", "6"],
      ["1", "2"],
    ]);
    const selection = mounted.view.state.selection;
    expect(selection).toBeInstanceOf(CellSelection);
    expect((selection as CellSelection).isRowSelection()).toBe(true);
    expect(selectedRect(mounted.view.state)).toMatchObject({ top: 3, bottom: 4 });

    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(original);

    expect(moveTableRowsTo(mounted.view, 0, { from: 2, to: 4 }, 1)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["3", "4"],
      ["5", "6"],
      ["1", "2"],
    ]);
    expect(selectedRect(mounted.view.state)).toMatchObject({ top: 1, bottom: 3 });

    expect(moveTableColumnsTo(mounted.view, 0, { from: 0, to: 1 }, 2)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["B", "A"],
      ["4", "3"],
      ["6", "5"],
      ["2", "1"],
    ]);
    expect((mounted.view.state.selection as CellSelection).isColSelection()).toBe(true);
    expect(selectedRect(mounted.view.state)).toMatchObject({ left: 1, right: 2 });
    expect(mounted.view.dom.querySelectorAll("tr:first-child > th")).toHaveLength(2);
  });

  it("keeps the header row in place and leaves a move back to where it started undone", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);
    const original = mounted.getMarkdown();
    const table = mounted.view.state.doc.child(0);

    expect(canMoveTableRowsTo(table, { from: 0, to: 1 }, 3)).toBe(false);
    expect(canMoveTableRowsTo(table, { from: 1, to: 2 }, 0)).toBe(false);
    expect(canMoveTableRowsTo(table, { from: 1, to: 2 }, 1)).toBe(false);
    expect(canMoveTableRowsTo(table, { from: 1, to: 2 }, 2)).toBe(false);
    expect(canMoveTableRowsTo(table, { from: 1, to: 2 }, 3)).toBe(true);
    expect(canMoveTableColumnsTo(table, { from: 0, to: 1 }, 0)).toBe(false);
    expect(canMoveTableColumnsTo(table, { from: 0, to: 1 }, 1)).toBe(false);
    expect(canMoveTableColumnsTo(table, { from: 0, to: 1 }, 2)).toBe(true);
    expect(moveTableRowsTo(mounted.view, 0, { from: 0, to: 1 }, 3)).toBe(false);
    expect(moveTableRowsTo(mounted.view, 0, { from: 2, to: 3 }, 0)).toBe(false);
    expect(moveTableColumnsTo(mounted.view, 0, { from: 1, to: 2 }, 2)).toBe(false);
    expect(mounted.getMarkdown()).toBe(original);
  });
});

describe("editor table column alignment", () => {
  const ALIGNED_TABLE_MARKDOWN =
    "| A | B | C |\n| - | :-: | -: |\n| **1** | 2 | 3 |\n| 4 | 5 | 6 |";

  const getColumnAlignments = (mounted: MountedMilkdownEditor) =>
    Array.from(mounted.view.dom.querySelectorAll("tr")).map((row) =>
      Array.from(row.querySelectorAll<HTMLElement>("th, td")).map((cell) => cell.style.textAlign),
    );

  const getWrittenAlignments = (mounted: MountedMilkdownEditor) =>
    mounted
      .getMarkdown()
      .split("\n")[1]
      ?.split("|")
      .slice(1, -1)
      .map((cell) => {
        const delimiter = cell.trim();

        if (delimiter.startsWith(":")) {
          return delimiter.endsWith(":") ? "center" : "left";
        }

        return delimiter.endsWith(":") ? "right" : null;
      });

  const getCheckedAlignments = (mounted: MountedMilkdownEditor) =>
    Object.entries(getEditorCommandState(mounted.view).checkedCommands)
      .filter(
        ([commandId, checked]) => commandId.startsWith("format.table.columnAlignment") && checked,
      )
      .map(([commandId]) => commandId);

  it("aligns the whole column holding the caret or a text selection", async () => {
    const mounted = await mountEditor(ALIGNED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 2, 0);

    expect(getTableColumnAlignment(mounted.view.state)).toBeNull();
    expect(setTableColumnAlignment(mounted.view, "right")).toBe(true);
    expect(getColumnAlignments(mounted).map((row) => row[0])).toEqual(["right", "right", "right"]);

    const cellText = getEditorDomElement(mounted, "strong");
    setSelectionAtElementTextEnd(mounted.view, cellText);
    const end = mounted.view.state.selection.from;
    setTextSelection(mounted.view, end - 1, end);

    expect(setTableColumnAlignment(mounted.view, "center")).toBe(true);
    expect(mounted.getMarkdown()).toBe(
      "|   A   |  B  |  C |\n| :---: | :-: | -: |\n| **1** |  2  |  3 |\n|   4   |  5  |  6 |\n",
    );
  });

  it("aligns every column a cell selection intersects", async () => {
    const mounted = await mountEditor(ALIGNED_TABLE_MARKDOWN);

    selectTableCellRange(mounted, { row: 1, col: 1 }, { row: 2, col: 2 });

    expect(getTableColumnAlignment(mounted.view.state)).toBeUndefined();
    expect(setTableColumnAlignment(mounted.view, "left")).toBe(true);
    expect(getColumnAlignments(mounted)).toEqual([
      ["", "left", "left"],
      ["", "left", "left"],
      ["", "left", "left"],
    ]);
    expect(getWrittenAlignments(mounted)).toEqual([null, "left", "left"]);
  });

  it("aligns every column for a whole-row selection and one column for a whole-column one", async () => {
    const rowEditor = await mountEditor(ALIGNED_TABLE_MARKDOWN);

    selectTableCellRange(rowEditor, { row: 1, col: 0 }, { row: 1, col: 2 });
    expect(setTableColumnAlignment(rowEditor.view, "center")).toBe(true);
    expect(getWrittenAlignments(rowEditor)).toEqual(["center", "center", "center"]);

    const columnEditor = await mountEditor(ALIGNED_TABLE_MARKDOWN);

    selectTableCellRange(columnEditor, { row: 0, col: 2 }, { row: 2, col: 2 });
    expect(setTableColumnAlignment(columnEditor.view, null)).toBe(true);
    expect(getWrittenAlignments(columnEditor)).toEqual([null, "center", null]);
  });

  it.each([
    ["default", 2, null, [null, "center", null]],
    ["left", 0, "left", ["left", "center", "right"]],
    ["center", 0, "center", ["center", "center", "right"]],
    ["right", 1, "right", [null, "right", "right"]],
  ] as const)(
    "writes %s alignment in the delimiter row",
    async (choice, col, alignment, written) => {
      const mounted = await mountEditor(ALIGNED_TABLE_MARKDOWN);

      setSelectionInTableCell(mounted, 1, col);

      expect(await runEditorCommand(mounted.editor, `format.table.columnAlignment.${choice}`)).toBe(
        true,
      );
      expect(getTableColumnAlignment(mounted.view.state)).toBe(alignment);
      expect(getCheckedAlignments(mounted)).toEqual([`format.table.columnAlignment.${choice}`]);
      expect(getWrittenAlignments(mounted)).toEqual(written);
    },
  );

  it("checks the shared alignment and none for mixed columns", async () => {
    const mounted = await mountEditor(ALIGNED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 2);
    expect(getCheckedAlignments(mounted)).toEqual(["format.table.columnAlignment.right"]);

    setSelectionInTableCell(mounted, 1, 0);
    expect(getCheckedAlignments(mounted)).toEqual(["format.table.columnAlignment.default"]);

    selectTableCellRange(mounted, { row: 1, col: 1 }, { row: 1, col: 2 });
    expect(getCheckedAlignments(mounted)).toEqual([]);
  });

  it("changes nothing when every target column already has the alignment", async () => {
    const mounted = await mountEditor(ALIGNED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 1);
    const stateBefore = mounted.view.state;

    expect(setTableColumnAlignment(mounted.view, "center")).toBe(true);
    expect(mounted.view.state.doc).toBe(stateBefore.doc);
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(false);
  });

  it("keeps content and selection and undoes and redoes as one step", async () => {
    const mounted = await mountEditor(ALIGNED_TABLE_MARKDOWN);
    const original = mounted.getMarkdown();

    selectTableCellRange(mounted, { row: 0, col: 0 }, { row: 2, col: 1 });
    const selectionBefore = mounted.view.state.selection;

    expect(setTableColumnAlignment(mounted.view, "right")).toBe(true);
    expect(mounted.view.state.selection.eq(selectionBefore)).toBe(true);
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B", "C"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
    expect(mounted.view.dom.querySelector("td strong")).toHaveTextContent("1");

    const aligned = mounted.getMarkdown();

    expect(getWrittenAlignments(mounted)).toEqual(["right", "right", "right"]);
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(original);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(aligned);
  });

  it("reads saved alignment back when the Markdown is reopened", async () => {
    const mounted = await mountEditor(ALIGNED_TABLE_MARKDOWN);

    selectTableCellRange(mounted, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(setTableColumnAlignment(mounted.view, "left")).toBe(true);

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(getColumnAlignments(reopened)[2]).toEqual(["left", "left", "right"]);
    expect(reopened.getMarkdown()).toBe(mounted.getMarkdown());
  });

  it("is unavailable outside a table", async () => {
    const mounted = await mountEditor(`Before\n\n${ALIGNED_TABLE_MARKDOWN}`);

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "p"));

    expect(canUseTable(mounted.view.state)).toBe(false);
    expect(getEditorCommandState(mounted.view).enabledCommands).toMatchObject({
      "format.table.columnAlignment.default": false,
      "format.table.columnAlignment.left": false,
      "format.table.columnAlignment.center": false,
      "format.table.columnAlignment.right": false,
    });
    expect(getCheckedAlignments(mounted)).toEqual([]);
    expect(setTableColumnAlignment(mounted.view, "left")).toBe(false);
  });
});
