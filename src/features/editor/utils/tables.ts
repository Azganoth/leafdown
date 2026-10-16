import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Selection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import {
  CellSelection,
  isInTable,
  selectedRect,
  TableMap,
  type TableRect,
} from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";

export interface TableCellCoordinates {
  col: number;
  row: number;
}

export type TableAxis = "column" | "row";

// Rows or columns from `from` up to, not including, `to`.
export interface TableAxisRange {
  from: number;
  to: number;
}

export const getSelectedTableRect = (state: EditorState): TableRect | null => {
  if (!isInTable(state)) {
    return null;
  }

  return selectedRect(state);
};

export const getTablePosition = (rect: TableRect) => rect.tableStart - 1;

export const getTableCellSelectionPosition = (
  tableStart: number,
  table: ProseMirrorNode,
  { col, row }: TableCellCoordinates,
) => {
  const map = TableMap.get(table);
  const boundedRow = Math.min(Math.max(row, 0), map.height - 1);
  const boundedCol = Math.min(Math.max(col, 0), map.width - 1);

  return tableStart + map.positionAt(boundedRow, boundedCol, table) + 1;
};

export const setTableCellSelection = (
  transaction: Transaction,
  tableStart: number,
  table: ProseMirrorNode,
  cell: TableCellCoordinates,
) => {
  const selection = Selection.findFrom(
    transaction.doc.resolve(getTableCellSelectionPosition(tableStart, table, cell)),
    1,
    true,
  );

  if (!selection) {
    return false;
  }

  transaction.setSelection(selection);

  return true;
};

// Selects whole rows or columns from the anchor's to the head's, keeping the anchor where a later
// extension starts from.
export const setTableAxisSelection = (
  transaction: Transaction,
  tableStart: number,
  table: ProseMirrorNode,
  axis: TableAxis,
  anchor: number,
  head: number,
) => {
  const map = TableMap.get(table);
  const resolveCell = (row: number, col: number) =>
    transaction.doc.resolve(tableStart + map.positionAt(row, col, table));
  const selection =
    axis === "row"
      ? new CellSelection(resolveCell(anchor, 0), resolveCell(head, map.width - 1))
      : new CellSelection(resolveCell(0, anchor), resolveCell(map.height - 1, head));

  transaction.setSelection(selection);
};

// The whole rows or columns a cell selection in the table covers, with the index of its anchor.
export const getSelectedTableAxis = (
  state: EditorState,
  tablePos: number,
  axis: TableAxis,
): (TableAxisRange & { anchor: number }) | null => {
  const { selection } = state;

  if (
    !(selection instanceof CellSelection) ||
    !(axis === "row" ? selection.isRowSelection() : selection.isColSelection())
  ) {
    return null;
  }

  const rect = selectedRect(state);

  if (getTablePosition(rect) !== tablePos) {
    return null;
  }

  const anchor = rect.map.findCell(selection.$anchorCell.pos - rect.tableStart);

  return axis === "row"
    ? { from: rect.top, to: rect.bottom, anchor: anchor.top }
    : { from: rect.left, to: rect.right, anchor: anchor.left };
};

export const dispatchSelectedTableCellSelection = (
  view: EditorView,
  cell: TableCellCoordinates,
) => {
  const rect = getSelectedTableRect(view.state);

  if (!rect) {
    return false;
  }

  const tr = view.state.tr;

  if (!setTableCellSelection(tr, rect.tableStart, rect.table, cell)) {
    return false;
  }

  view.dispatch(tr.scrollIntoView());

  return true;
};
