import type { NodeType, Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import {
  deleteTable as milkdownDeleteTable,
  TableMap,
  type TableRect,
} from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";

import { areNonNullish } from "@/lib/predicates";

import {
  finalizeSourceProjection,
  SOURCE_PROJECTION_RESTRUCTURE_META,
} from "../../plugins/sourceProjection";
import { getNodeType, runProseMirrorCommand, setSelectionNear } from "../../utils/milkdown";
import {
  getSelectedTableRect,
  getTablePosition,
  setTableCellSelection,
  type TableCellCoordinates,
} from "../../utils/tables";

type TableMoveDirection = -1 | 1;

const cloneCellAsType = (cellType: NodeType, cell: ProseMirrorNode) =>
  cell.type === cellType ? cell : cellType.create(cell.attrs, cell.content, cell.marks);

const createRow = (
  rowType: NodeType,
  cellType: NodeType,
  row: ProseMirrorNode,
  cells: ProseMirrorNode[],
) =>
  rowType.create(
    row.attrs,
    cells.map((cell) => cloneCellAsType(cellType, cell)),
  );

const createBodyCell = (state: EditorState, alignment: unknown) =>
  getNodeType(state, "table_cell")?.createAndFill({ alignment });

const createTableFromRows = (
  state: EditorState,
  sourceTable: ProseMirrorNode,
  rows: ProseMirrorNode[],
) => getNodeType(state, "table")?.create(sourceTable.attrs, rows);

const getRows = (table: ProseMirrorNode) =>
  Array.from({ length: table.childCount }, (_, index) => table.child(index));

const getCells = (row: ProseMirrorNode) =>
  Array.from({ length: row.childCount }, (_, index) => row.child(index));

const selectionIncludesHeaderRow = (rect: TableRect) => rect.top === 0;

const dispatchTableReplacement = (
  view: EditorView,
  rect: TableRect,
  table: ProseMirrorNode,
  selectionCell?: TableCellCoordinates,
) => {
  const tablePos = getTablePosition(rect);
  const tableStart = tablePos + 1;
  const tr = view.state.tr
    .replaceWith(tablePos, tablePos + rect.table.nodeSize, table)
    .setMeta(SOURCE_PROJECTION_RESTRUCTURE_META, true);

  if (selectionCell) {
    setTableCellSelection(tr, tableStart, table, selectionCell);
  } else {
    setSelectionNear(tr, tableStart);
  }

  view.focus();
  view.dispatch(tr.scrollIntoView());
};

const createBodyRow = (state: EditorState, table: ProseMirrorNode, width: number) => {
  const rowType = getNodeType(state, "table_row");
  const headerRow = table.firstChild;

  if (!rowType || !headerRow) {
    return null;
  }

  const cells = Array.from({ length: width }, (_, col) =>
    createBodyCell(state, headerRow.maybeChild(col)?.attrs.alignment),
  );

  if (!areNonNullish(cells)) {
    return null;
  }

  return rowType.create(null, cells);
};

const addRow = (view: EditorView, placement: "above" | "below") => {
  const rect = getSelectedTableRect(view.state);
  if (!rect || (placement === "above" && selectionIncludesHeaderRow(rect))) {
    return false;
  }

  const row = createBodyRow(view.state, rect.table, rect.map.width);

  if (!row) {
    return false;
  }

  const rows = getRows(rect.table);
  const insertIndex = placement === "above" ? rect.top : Math.max(1, rect.bottom);

  rows.splice(insertIndex, 0, row);

  const nextTable = createTableFromRows(view.state, rect.table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(view, rect, nextTable, { row: insertIndex, col: rect.left });
  return true;
};

const createColumnCell = (state: EditorState, rowIndex: number, alignment: unknown) =>
  getNodeType(state, rowIndex === 0 ? "table_header" : "table_cell")?.createAndFill({
    alignment,
  }) ?? null;

const mapTableRows = (
  state: EditorState,
  rect: TableRect,
  transformCells: (cells: ProseMirrorNode[], rowIndex: number) => ProseMirrorNode[] | null,
) =>
  getRows(rect.table).map((row, rowIndex) => {
    const rowType = getNodeType(state, rowIndex === 0 ? "table_header_row" : "table_row");
    const cellType = getNodeType(state, rowIndex === 0 ? "table_header" : "table_cell");
    const cells = getCells(row);

    if (!rowType || !cellType) {
      return null;
    }

    const nextCells = transformCells(cells, rowIndex);

    if (!nextCells) {
      return null;
    }

    return createRow(rowType, cellType, row, nextCells);
  });

const addColumn = (view: EditorView, placement: "before" | "after") => {
  const rect = getSelectedTableRect(view.state);

  if (!rect) {
    return false;
  }

  const insertIndex = placement === "before" ? rect.left : rect.right;
  const rows = mapTableRows(view.state, rect, (cells, rowIndex) => {
    const alignmentSourceIndex = Math.min(insertIndex, Math.max(cells.length - 1, 0));
    const cell = createColumnCell(
      view.state,
      rowIndex,
      cells[alignmentSourceIndex]?.attrs.alignment,
    );

    if (!cell) {
      return null;
    }

    cells.splice(insertIndex, 0, cell);
    return cells;
  });

  if (!areNonNullish(rows)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, rect.table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(view, rect, nextTable, { row: rect.top, col: insertIndex });
  return true;
};

const moveRows = (view: EditorView, direction: TableMoveDirection) => {
  const rect = getSelectedTableRect(view.state);

  if (!rect || !canMoveRows(view.state, direction)) {
    return false;
  }

  const rows = getRows(rect.table);
  const selectedRows = rows.splice(rect.top, rect.bottom - rect.top);
  const nextTop = direction === -1 ? rect.top - 1 : rect.top + 1;

  rows.splice(nextTop, 0, ...selectedRows);

  const nextTable = createTableFromRows(view.state, rect.table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(view, rect, nextTable, { row: nextTop, col: rect.left });
  return true;
};

const moveColumns = (view: EditorView, direction: TableMoveDirection) => {
  const rect = getSelectedTableRect(view.state);

  if (!rect || !canMoveColumns(view.state, direction)) {
    return false;
  }

  const nextLeft = direction === -1 ? rect.left - 1 : rect.left + 1;
  const rows = mapTableRows(view.state, rect, (cells) => {
    const selectedCells = cells.splice(rect.left, rect.right - rect.left);
    cells.splice(nextLeft, 0, ...selectedCells);
    return cells;
  });

  if (!areNonNullish(rows)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, rect.table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(view, rect, nextTable, { row: rect.top, col: nextLeft });
  return true;
};

const convertRowToBody = (state: EditorState, row: ProseMirrorNode) => {
  const rowType = getNodeType(state, "table_row");
  const cellType = getNodeType(state, "table_cell");

  if (!rowType || !cellType) {
    return null;
  }

  return createRow(rowType, cellType, row, getCells(row));
};

const removeRows = (view: EditorView) => {
  const rect = getSelectedTableRect(view.state);

  if (!rect || selectionIncludesHeaderRow(rect)) {
    return false;
  }

  const rows = getRows(rect.table).filter((_, index) => index < rect.top || index >= rect.bottom);

  if (rows.length < 2) {
    return runProseMirrorCommand(view, milkdownDeleteTable);
  }

  const [headerSource, ...bodySources] = rows;
  const bodyRows = bodySources.map((row) => convertRowToBody(view.state, row));

  if (!areNonNullish(bodyRows)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, rect.table, [headerSource, ...bodyRows]);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(view, rect, nextTable, {
    row: Math.min(rect.top, TableMap.get(nextTable).height - 1),
    col: rect.left,
  });
  return true;
};

const removeColumns = (view: EditorView) => {
  const rect = getSelectedTableRect(view.state);

  if (!rect) {
    return false;
  }

  if (rect.left === 0 && rect.right === rect.map.width) {
    return runProseMirrorCommand(view, milkdownDeleteTable);
  }

  const rows = mapTableRows(view.state, rect, (cells) => {
    const keptCells = cells.filter((_, index) => index < rect.left || index >= rect.right);

    if (keptCells.length === 0) {
      return null;
    }

    return keptCells;
  });

  if (!areNonNullish(rows)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, rect.table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(view, rect, nextTable, {
    row: rect.top,
    col: Math.min(rect.left, TableMap.get(nextTable).width - 1),
  });
  return true;
};

/* Commands */

const restructuring = (command: (view: EditorView) => boolean) => (view: EditorView) => {
  finalizeSourceProjection(view);

  return command(view);
};

export const deleteTable = restructuring((view) =>
  runProseMirrorCommand(view, milkdownDeleteTable),
);

export const deleteRows = restructuring(removeRows);

export const deleteColumns = restructuring(removeColumns);

export const addRowAbove = restructuring((view) => addRow(view, "above"));

export const addRowBelow = restructuring((view) => addRow(view, "below"));

export const addColumnBefore = restructuring((view) => addColumn(view, "before"));

export const addColumnAfter = restructuring((view) => addColumn(view, "after"));

export const moveRowUp = restructuring((view) => moveRows(view, -1));

export const moveRowDown = restructuring((view) => moveRows(view, 1));

export const moveColumnLeft = restructuring((view) => moveColumns(view, -1));

export const moveColumnRight = restructuring((view) => moveColumns(view, 1));

/* State */

export const canUseTable = (state: EditorState) => getSelectedTableRect(state) !== null;

export const canAddRowAbove = (state: EditorState) => {
  const rect = getSelectedTableRect(state);

  if (!rect) {
    return false;
  }

  return !selectionIncludesHeaderRow(rect);
};

export const canAddRowBelow = (state: EditorState) => getSelectedTableRect(state) !== null;

export const canDeleteRows = (state: EditorState) => {
  const rect = getSelectedTableRect(state);

  if (!rect) {
    return false;
  }

  return !selectionIncludesHeaderRow(rect);
};

export const canMoveRows = (state: EditorState, direction: TableMoveDirection) => {
  const rect = getSelectedTableRect(state);

  if (!rect || rect.top < 1) {
    return false;
  }

  return direction === -1 ? rect.top > 1 : rect.bottom < rect.map.height;
};

export const canMoveColumns = (state: EditorState, direction: TableMoveDirection) => {
  const rect = getSelectedTableRect(state);

  if (!rect) {
    return false;
  }

  return direction === -1 ? rect.left > 0 : rect.right < rect.map.width;
};
