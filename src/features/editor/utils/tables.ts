import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Selection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { isInTable, selectedRect, TableMap, type TableRect } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";

export interface TableCellCoordinates {
  col: number;
  row: number;
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
