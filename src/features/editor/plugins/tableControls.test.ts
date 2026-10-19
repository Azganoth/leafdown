// @vitest-environment happy-dom

import { CellSelection, selectedRect } from "@milkdown/kit/prose/tables";
import { describe, expect, it, vi } from "vitest";

import { dispatchMouseEvent, stubElementsFromPoint } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getTableCellTexts, selectTableCellRange } from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";

import { runEditorCommand } from "../commands";

const mountEditor = setupMilkdownEditorMount();

const TABLE_LEFT = 100;
const TABLE_TOP = 100;
const COLUMN_WIDTH = 120;
const ROW_HEIGHT = 40;

const THREE_BODY_ROWS = "| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |";

const createRect = (left: number, top: number, width: number, height: number): DOMRect => ({
  bottom: top + height,
  height,
  left,
  right: left + width,
  top,
  width,
  x: left,
  y: top,
  toJSON: () => ({}),
});

// Row `row` and column `col` of the laid-out table, measured at their centers.
const cellCenter = (row: number, col: number) => ({
  clientX: TABLE_LEFT + (col + 0.5) * COLUMN_WIDTH,
  clientY: TABLE_TOP + (row + 0.5) * ROW_HEIGHT,
});

const rowBoundaryY = (boundary: number) => TABLE_TOP + boundary * ROW_HEIGHT;

const columnBoundaryX = (boundary: number) => TABLE_LEFT + boundary * COLUMN_WIDTH;

// happy-dom has no layout, so the table is given columns 120 pixels wide and rows 40 pixels
// tall, and hit testing answers with the cell under the point.
const layOutTable = (mounted: MountedMilkdownEditor) => {
  const table = mounted.view.dom.querySelector("table");
  if (!table?.parentElement) throw new Error("Expected a rendered table.");
  const rows = Array.from(table.querySelectorAll("tr"));
  const width = (rows[0]?.children.length ?? 0) * COLUMN_WIDTH;
  const tableRect = createRect(TABLE_LEFT, TABLE_TOP, width, rows.length * ROW_HEIGHT);

  vi.spyOn(table, "getBoundingClientRect").mockReturnValue(tableRect);
  vi.spyOn(table.parentElement, "getBoundingClientRect").mockReturnValue(tableRect);
  rows.forEach((row, rowIndex) => {
    const top = TABLE_TOP + rowIndex * ROW_HEIGHT;
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
      createRect(TABLE_LEFT, top, width, ROW_HEIGHT),
    );
    Array.from(row.children).forEach((cell, colIndex) => {
      vi.spyOn(cell, "getBoundingClientRect").mockReturnValue(
        createRect(TABLE_LEFT + colIndex * COLUMN_WIDTH, top, COLUMN_WIDTH, ROW_HEIGHT),
      );
    });
  });

  stubElementsFromPoint((x, y) => {
    const cell = Array.from(mounted.view.dom.querySelectorAll("th, td")).find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
    });
    return cell
      ? [cell.firstElementChild ?? cell, cell, mounted.view.dom, document.body]
      : [mounted.view.dom, document.body];
  });
};

const getControl = (selector: string) => {
  const control = document.querySelector<HTMLButtonElement>(selector);
  if (!control) throw new Error(`Expected a table control: ${selector}`);
  return control;
};

const getControls = () => ({
  rowGrip: getControl('[data-leafdown-table-grip][data-axis="row"]'),
  columnGrip: getControl('[data-leafdown-table-grip][data-axis="column"]'),
  rowInsert: getControl('[data-leafdown-table-insert][data-axis="row"]'),
  columnInsert: getControl('[data-leafdown-table-insert][data-axis="column"]'),
  indicator: document.querySelector<HTMLElement>(".leafdown-table-indicator")!,
});

const hover = (point: { clientX: number; clientY: number }) =>
  dispatchMouseEvent(document, "mousemove", point);

const settleAnimationFrame = () =>
  new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

const dragGrip = (
  grip: HTMLElement,
  from: { clientX: number; clientY: number },
  to: { clientX: number; clientY: number },
) => {
  dispatchMouseEvent(grip, "mousedown", { button: 0, buttons: 1, ...from });
  dispatchMouseEvent(document, "mousemove", { buttons: 1, ...to });
};

describe("table controls", () => {
  it("shows the hovered cell's grips and boundary buttons without moving document text", async () => {
    const mounted = await mountEditor(THREE_BODY_ROWS);
    layOutTable(mounted);
    const before = mounted.view.dom.innerHTML;
    const markdown = mounted.getMarkdown();
    const { rowGrip, columnGrip, rowInsert, columnInsert, indicator } = getControls();

    hover({ clientX: columnBoundaryX(1) + 30, clientY: rowBoundaryY(2) - 10 });

    expect(rowGrip).not.toHaveAttribute("hidden");
    expect(rowGrip.style.left).toBe(`${String(TABLE_LEFT)}px`);
    expect(rowGrip.style.top).toBe(`${String(cellCenter(1, 1).clientY)}px`);
    expect(columnGrip).not.toHaveAttribute("hidden");
    expect(columnGrip.style.left).toBe(`${String(cellCenter(1, 1).clientX)}px`);
    expect(columnGrip.style.top).toBe(`${String(TABLE_TOP)}px`);
    expect(rowInsert.style.top).toBe(`${String(rowBoundaryY(2))}px`);
    expect(rowInsert.style.left).toBe(`${String(TABLE_LEFT)}px`);
    expect(columnInsert.style.left).toBe(`${String(columnBoundaryX(1))}px`);
    expect(columnInsert.style.top).toBe(`${String(TABLE_TOP)}px`);
    expect(indicator).toHaveAttribute("hidden");

    for (const control of [rowGrip, columnGrip, rowInsert, columnInsert]) {
      expect(control.tabIndex).toBe(-1);
      expect(control).toHaveAttribute("aria-label");
    }

    dispatchMouseEvent(rowInsert, "mouseenter");
    expect(indicator).not.toHaveAttribute("hidden");
    expect(indicator).not.toHaveAttribute("data-drop");
    expect(indicator.style.top).toBe(`${String(rowBoundaryY(2))}px`);
    dispatchMouseEvent(rowInsert, "mouseleave");
    expect(indicator).toHaveAttribute("hidden");

    hover(cellCenter(0, 0));
    expect(rowGrip).toHaveAttribute("hidden");
    expect(columnGrip.style.left).toBe(`${String(cellCenter(0, 0).clientX)}px`);
    expect(rowInsert.style.top).toBe(`${String(rowBoundaryY(1))}px`);

    hover({ clientX: TABLE_LEFT - 50, clientY: cellCenter(1, 0).clientY });
    for (const control of [rowGrip, columnGrip, rowInsert, columnInsert]) {
      expect(control).toHaveAttribute("hidden");
    }

    expect(mounted.view.dom.innerHTML).toBe(before);
    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it("keeps the hovered cell while the pointer rests on a control", async () => {
    const mounted = await mountEditor(THREE_BODY_ROWS);
    layOutTable(mounted);
    const { rowGrip, columnGrip, columnInsert } = getControls();

    hover(cellCenter(2, 1));
    dispatchMouseEvent(rowGrip, "mousemove", {
      clientX: TABLE_LEFT,
      clientY: cellCenter(2, 0).clientY,
    });

    expect(columnGrip.style.left).toBe(`${String(cellCenter(2, 1).clientX)}px`);
    expect(columnInsert.style.left).toBe(`${String(columnBoundaryX(1))}px`);
  });

  it("selects a row or a column from its grip and opens the popup on release", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(THREE_BODY_ROWS, { onContextPopupRequested });
    layOutTable(mounted);
    const { rowGrip, columnGrip } = getControls();

    hover(cellCenter(2, 1));
    dispatchMouseEvent(rowGrip, "mousedown", { button: 0, buttons: 1 });

    let selection = mounted.view.state.selection;
    expect(selection).toBeInstanceOf(CellSelection);
    expect((selection as CellSelection).isRowSelection()).toBe(true);
    expect(selectedRect(mounted.view.state)).toMatchObject({ top: 2, bottom: 3 });
    expect(document.activeElement).toBe(mounted.view.dom);
    expect(onContextPopupRequested).not.toHaveBeenCalled();

    dispatchMouseEvent(rowGrip, "mouseup", { button: 0 });
    await waitFor(() => {
      expect(onContextPopupRequested).toHaveBeenCalledWith(
        expect.objectContaining({
          container: "table",
          source: "pointer",
          table: expect.objectContaining({ axis: "row" }),
        }),
      );
      expect(rowGrip).toHaveAttribute("data-selected");
    });

    hover(cellCenter(1, 0));
    dispatchMouseEvent(columnGrip, "mousedown", { button: 0, buttons: 1 });
    dispatchMouseEvent(columnGrip, "mouseup", { button: 0 });

    selection = mounted.view.state.selection;
    expect((selection as CellSelection).isColSelection()).toBe(true);
    expect(selectedRect(mounted.view.state)).toMatchObject({ left: 0, right: 1, top: 0 });
    await waitFor(() => {
      expect(columnGrip).toHaveAttribute("data-selected");
      expect(rowGrip).not.toHaveAttribute("data-selected");
      expect(onContextPopupRequested).toHaveBeenLastCalledWith(
        expect.objectContaining({ table: expect.objectContaining({ axis: "column" }) }),
      );
    });
  });

  it("drags a row to the boundary under the pointer as one undoable change", async () => {
    const onContextPopupRequested = vi.fn();
    const mounted = await mountEditor(THREE_BODY_ROWS, { onContextPopupRequested });
    layOutTable(mounted);
    const original = mounted.getMarkdown();
    const { rowGrip, indicator } = getControls();

    hover(cellCenter(1, 0));
    dragGrip(
      rowGrip,
      { clientX: TABLE_LEFT, clientY: cellCenter(1, 0).clientY },
      {
        clientX: cellCenter(3, 1).clientX,
        clientY: rowBoundaryY(4) - 5,
      },
    );

    expect(mounted.view.dom).toHaveAttribute("data-leafdown-table-dragging");
    expect(indicator).not.toHaveAttribute("hidden");
    expect(indicator).toHaveAttribute("data-drop");
    expect(indicator.style.top).toBe(`${String(rowBoundaryY(4))}px`);

    dispatchMouseEvent(document.body, "mouseup", { button: 0 });
    await settleAnimationFrame();

    expect(mounted.view.dom).not.toHaveAttribute("data-leafdown-table-dragging");
    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["3", "4"],
      ["5", "6"],
      ["1", "2"],
    ]);
    expect(selectedRect(mounted.view.state)).toMatchObject({ top: 3, bottom: 4 });
    expect(onContextPopupRequested).not.toHaveBeenCalled();

    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(original);
  });

  it("lands nothing above the header row and changes nothing for a drop where the drag started", async () => {
    const mounted = await mountEditor(THREE_BODY_ROWS);
    layOutTable(mounted);
    const { rowGrip, indicator } = getControls();

    hover(cellCenter(1, 0));
    dragGrip(
      rowGrip,
      { clientX: TABLE_LEFT, clientY: cellCenter(1, 0).clientY },
      {
        clientX: cellCenter(1, 0).clientX,
        clientY: rowBoundaryY(1) + 5,
      },
    );
    expect(indicator).toHaveAttribute("hidden");
    dispatchMouseEvent(document.body, "mouseup", { button: 0 });
    expect(getTableCellTexts(mounted)[1]).toEqual(["1", "2"]);

    hover(cellCenter(3, 0));
    dragGrip(
      rowGrip,
      { clientX: TABLE_LEFT, clientY: cellCenter(3, 0).clientY },
      {
        clientX: cellCenter(0, 0).clientX,
        clientY: TABLE_TOP + 2,
      },
    );
    expect(indicator.style.top).toBe(`${String(rowBoundaryY(1))}px`);
    dispatchMouseEvent(document.body, "mouseup", { button: 0 });

    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "B"],
      ["5", "6"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("drags a column, and a selected row range as one", async () => {
    const mounted = await mountEditor(THREE_BODY_ROWS);
    layOutTable(mounted);
    const { rowGrip, columnGrip } = getControls();

    hover(cellCenter(1, 0));
    dragGrip(
      columnGrip,
      { clientX: cellCenter(0, 0).clientX, clientY: TABLE_TOP },
      {
        clientX: columnBoundaryX(2) - 5,
        clientY: TABLE_TOP,
      },
    );
    dispatchMouseEvent(document.body, "mouseup", { button: 0 });

    expect(getTableCellTexts(mounted)).toEqual([
      ["B", "A"],
      ["2", "1"],
      ["4", "3"],
      ["6", "5"],
    ]);

    layOutTable(mounted);
    selectTableCellRange(mounted, { row: 2, col: 0 }, { row: 3, col: 1 });
    hover(cellCenter(3, 1));
    dragGrip(
      rowGrip,
      { clientX: TABLE_LEFT, clientY: cellCenter(3, 1).clientY },
      {
        clientX: cellCenter(1, 1).clientX,
        clientY: rowBoundaryY(1) + 5,
      },
    );
    dispatchMouseEvent(document.body, "mouseup", { button: 0 });

    expect(getTableCellTexts(mounted)).toEqual([
      ["B", "A"],
      ["4", "3"],
      ["6", "5"],
      ["2", "1"],
    ]);
    expect(selectedRect(mounted.view.state)).toMatchObject({ top: 1, bottom: 3 });
  });

  it("collapses a selected range to the pressed grip's row on release without a drag", async () => {
    const mounted = await mountEditor(THREE_BODY_ROWS);
    layOutTable(mounted);
    const { rowGrip } = getControls();
    selectTableCellRange(mounted, { row: 1, col: 0 }, { row: 3, col: 1 });

    hover(cellCenter(2, 0));
    dispatchMouseEvent(rowGrip, "mousedown", { button: 0, buttons: 1 });
    expect(selectedRect(mounted.view.state)).toMatchObject({ top: 1, bottom: 4 });
    dispatchMouseEvent(rowGrip, "mouseup", { button: 0 });
    dispatchMouseEvent(document.body, "mouseup", { button: 0 });

    expect(selectedRect(mounted.view.state)).toMatchObject({ top: 2, bottom: 3 });

    hover(cellCenter(3, 0));
    dispatchMouseEvent(rowGrip, "mousedown", { button: 0, buttons: 1, shiftKey: true });
    expect(selectedRect(mounted.view.state)).toMatchObject({ top: 2, bottom: 4 });
  });

  it("inserts a row at an end boundary and a column at an inner one", async () => {
    const mounted = await mountEditor(THREE_BODY_ROWS);
    layOutTable(mounted);
    const { rowInsert, columnInsert } = getControls();

    hover({ clientX: columnBoundaryX(1) - 10, clientY: rowBoundaryY(4) - 5 });
    expect(rowInsert.style.top).toBe(`${String(rowBoundaryY(4))}px`);
    expect(dispatchMouseEvent(columnInsert, "mousedown", { button: 0 }).defaultPrevented).toBe(
      true,
    );
    dispatchMouseEvent(columnInsert, "click");
    dispatchMouseEvent(rowInsert, "click");

    expect(getTableCellTexts(mounted)).toEqual([
      ["A", "", "B"],
      ["1", "", "2"],
      ["3", "", "4"],
      ["5", "", "6"],
      ["", "", ""],
    ]);
    expect(mounted.view.dom.querySelectorAll("tr:first-child > th")).toHaveLength(3);
  });
});
