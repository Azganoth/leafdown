import type { NodeType, Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
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
import { getNodeType, runProseMirrorCommand } from "../../utils/milkdown";
import {
  getSelectedTableRect,
  getTablePosition,
  setTableAxisSelection,
  setTableCellSelection,
  type TableAxis,
  type TableAxisRange,
  type TableCellCoordinates,
} from "../../utils/tables";

type TableMoveDirection = -1 | 1;

type TableSelectionUpdate = (tr: Transaction, tableStart: number, table: ProseMirrorNode) => void;

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

const getTableAt = (state: EditorState, tablePos: number) => {
  const table = state.doc.nodeAt(tablePos);

  return table?.type.spec.tableRole === "table" ? table : null;
};

const selectCell =
  (cell: TableCellCoordinates): TableSelectionUpdate =>
  (tr, tableStart, table) => {
    setTableCellSelection(tr, tableStart, table, cell);
  };

const selectAxis =
  (axis: TableAxis, { from, to }: TableAxisRange): TableSelectionUpdate =>
  (tr, tableStart, table) => {
    setTableAxisSelection(tr, tableStart, table, axis, from, to - 1);
  };

const dispatchTableReplacement = (
  view: EditorView,
  tablePos: number,
  table: ProseMirrorNode,
  nextTable: ProseMirrorNode,
  updateSelection: TableSelectionUpdate,
) => {
  const tr = view.state.tr
    .replaceWith(tablePos, tablePos + table.nodeSize, nextTable)
    .setMeta(SOURCE_PROJECTION_RESTRUCTURE_META, true);

  updateSelection(tr, tablePos + 1, nextTable);
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

const insertRow = (
  view: EditorView,
  tablePos: number,
  table: ProseMirrorNode,
  index: number,
  selectionCol: number,
) => {
  const map = TableMap.get(table);

  if (index < 1 || index > map.height) {
    return false;
  }

  const row = createBodyRow(view.state, table, map.width);

  if (!row) {
    return false;
  }

  const rows = getRows(table);
  rows.splice(index, 0, row);

  const nextTable = createTableFromRows(view.state, table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(
    view,
    tablePos,
    table,
    nextTable,
    selectCell({ row: index, col: selectionCol }),
  );
  return true;
};

const addRow = (view: EditorView, placement: "above" | "below") => {
  const rect = getSelectedTableRect(view.state);
  if (!rect || (placement === "above" && selectionIncludesHeaderRow(rect))) {
    return false;
  }

  const insertIndex = placement === "above" ? rect.top : Math.max(1, rect.bottom);

  return insertRow(view, getTablePosition(rect), rect.table, insertIndex, rect.left);
};

const createColumnCell = (state: EditorState, rowIndex: number, alignment: unknown) =>
  getNodeType(state, rowIndex === 0 ? "table_header" : "table_cell")?.createAndFill({
    alignment,
  }) ?? null;

const mapTableRows = (
  state: EditorState,
  table: ProseMirrorNode,
  transformCells: (cells: ProseMirrorNode[], rowIndex: number) => ProseMirrorNode[] | null,
) =>
  getRows(table).map((row, rowIndex) => {
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

const insertColumn = (
  view: EditorView,
  tablePos: number,
  table: ProseMirrorNode,
  index: number,
  selectionRow: number,
) => {
  if (index < 0 || index > TableMap.get(table).width) {
    return false;
  }

  const rows = mapTableRows(view.state, table, (cells, rowIndex) => {
    const alignmentSourceIndex = Math.min(index, Math.max(cells.length - 1, 0));
    const cell = createColumnCell(
      view.state,
      rowIndex,
      cells[alignmentSourceIndex]?.attrs.alignment,
    );

    if (!cell) {
      return null;
    }

    cells.splice(index, 0, cell);
    return cells;
  });

  if (!areNonNullish(rows)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(
    view,
    tablePos,
    table,
    nextTable,
    selectCell({ row: selectionRow, col: index }),
  );
  return true;
};

const addColumn = (view: EditorView, placement: "before" | "after") => {
  const rect = getSelectedTableRect(view.state);

  if (!rect) {
    return false;
  }

  const insertIndex = placement === "before" ? rect.left : rect.right;

  return insertColumn(view, getTablePosition(rect), rect.table, insertIndex, rect.top);
};

// Where the range starts once it has moved to the boundary, counted in the table before the move.
const getMovedStart = ({ from, to }: TableAxisRange, boundary: number) =>
  boundary > from ? boundary - (to - from) : boundary;

const isMovableRange = ({ from, to }: TableAxisRange, first: number, end: number) =>
  first <= from && from < to && to <= end;

const isRangeBoundary = ({ from, to }: TableAxisRange, boundary: number) =>
  boundary >= from && boundary <= to;

export const canMoveTableRowsTo = (
  table: ProseMirrorNode,
  range: TableAxisRange,
  boundary: number,
) => {
  const { height } = TableMap.get(table);

  return (
    isMovableRange(range, 1, height) &&
    boundary >= 1 &&
    boundary <= height &&
    !isRangeBoundary(range, boundary)
  );
};

export const canMoveTableColumnsTo = (
  table: ProseMirrorNode,
  range: TableAxisRange,
  boundary: number,
) => {
  const { width } = TableMap.get(table);

  return (
    isMovableRange(range, 0, width) &&
    boundary >= 0 &&
    boundary <= width &&
    !isRangeBoundary(range, boundary)
  );
};

const moveRowsTo = (
  view: EditorView,
  tablePos: number,
  table: ProseMirrorNode,
  range: TableAxisRange,
  boundary: number,
  updateSelection: (start: number) => TableSelectionUpdate,
) => {
  if (!canMoveTableRowsTo(table, range, boundary)) {
    return false;
  }

  const rows = getRows(table);
  const movedRows = rows.splice(range.from, range.to - range.from);
  const start = getMovedStart(range, boundary);
  rows.splice(start, 0, ...movedRows);

  const nextTable = createTableFromRows(view.state, table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(view, tablePos, table, nextTable, updateSelection(start));
  return true;
};

const moveColumnsTo = (
  view: EditorView,
  tablePos: number,
  table: ProseMirrorNode,
  range: TableAxisRange,
  boundary: number,
  updateSelection: (start: number) => TableSelectionUpdate,
) => {
  if (!canMoveTableColumnsTo(table, range, boundary)) {
    return false;
  }

  const start = getMovedStart(range, boundary);
  const rows = mapTableRows(view.state, table, (cells) => {
    const movedCells = cells.splice(range.from, range.to - range.from);
    cells.splice(start, 0, ...movedCells);
    return cells;
  });

  if (!areNonNullish(rows)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, table, rows);

  if (!nextTable) {
    return false;
  }

  dispatchTableReplacement(view, tablePos, table, nextTable, updateSelection(start));
  return true;
};

const moveRows = (view: EditorView, direction: TableMoveDirection) => {
  const rect = getSelectedTableRect(view.state);

  if (!rect || !canMoveRows(view.state, direction)) {
    return false;
  }

  return moveRowsTo(
    view,
    getTablePosition(rect),
    rect.table,
    { from: rect.top, to: rect.bottom },
    direction === -1 ? rect.top - 1 : rect.bottom + 1,
    (start) => selectCell({ row: start, col: rect.left }),
  );
};

const moveColumns = (view: EditorView, direction: TableMoveDirection) => {
  const rect = getSelectedTableRect(view.state);

  if (!rect || !canMoveColumns(view.state, direction)) {
    return false;
  }

  return moveColumnsTo(
    view,
    getTablePosition(rect),
    rect.table,
    { from: rect.left, to: rect.right },
    direction === -1 ? rect.left - 1 : rect.right + 1,
    (start) => selectCell({ row: rect.top, col: start }),
  );
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

  dispatchTableReplacement(
    view,
    getTablePosition(rect),
    rect.table,
    nextTable,
    selectCell({
      row: Math.min(rect.top, TableMap.get(nextTable).height - 1),
      col: rect.left,
    }),
  );
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

  const rows = mapTableRows(view.state, rect.table, (cells) => {
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

  dispatchTableReplacement(
    view,
    getTablePosition(rect),
    rect.table,
    nextTable,
    selectCell({
      row: rect.top,
      col: Math.min(rect.left, TableMap.get(nextTable).width - 1),
    }),
  );
  return true;
};

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

// These take the table's position after any source projection has been finalized, since
// finalizing can move the table.

export const insertTableRowAt = (view: EditorView, tablePos: number, index: number) => {
  const table = getTableAt(view.state, tablePos);

  return table ? insertRow(view, tablePos, table, index, 0) : false;
};

export const insertTableColumnAt = (view: EditorView, tablePos: number, index: number) => {
  const table = getTableAt(view.state, tablePos);

  return table ? insertColumn(view, tablePos, table, index, 0) : false;
};

export const moveTableRowsTo = (
  view: EditorView,
  tablePos: number,
  range: TableAxisRange,
  boundary: number,
) => {
  const table = getTableAt(view.state, tablePos);

  return table
    ? moveRowsTo(view, tablePos, table, range, boundary, (start) =>
        selectAxis("row", { from: start, to: start + range.to - range.from }),
      )
    : false;
};

export const moveTableColumnsTo = (
  view: EditorView,
  tablePos: number,
  range: TableAxisRange,
  boundary: number,
) => {
  const table = getTableAt(view.state, tablePos);

  return table
    ? moveColumnsTo(view, tablePos, table, range, boundary, (start) =>
        selectAxis("column", { from: start, to: start + range.to - range.from }),
      )
    : false;
};

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
