import type { Node as ProseMirrorNode, NodeType } from "@milkdown/kit/prose/model";
import {
  Selection,
  type Command,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import {
  deleteTable,
  isInTable,
  selectedRect,
  TableMap,
  type TableRect,
} from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { AppCommandId } from "@/features/commands/types";

type TableCommandId =
  | "format.table.delete"
  | "format.table.addRowAbove"
  | "format.table.addRowBelow"
  | "format.table.addColumnBefore"
  | "format.table.addColumnAfter"
  | "format.table.moveRowUp"
  | "format.table.moveRowDown"
  | "format.table.moveColumnLeft"
  | "format.table.moveColumnRight"
  | "format.table.deleteRow"
  | "format.table.deleteColumn";

type TableMoveDirection = -1 | 1;

const getNodeType = (state: EditorState, nodeName: string) => state.schema.nodes[nodeName] ?? null;

const getTableRect = (state: EditorState) => (isInTable(state) ? selectedRect(state) : null);

const runProseMirrorTableCommand = (view: EditorView, command: Command) => {
  view.focus();
  return command(view.state, view.dispatch, view);
};

const tablePositionFromRect = (rect: TableRect) => rect.tableStart - 1;

const setSelectionNear = (tr: Transaction, position: number) => {
  const selection = Selection.findFrom(tr.doc.resolve(position), 1, true);

  if (selection) {
    tr.setSelection(selection);
  }
};

const setSelectionInCell = (
  tr: Transaction,
  tableStart: number,
  table: ProseMirrorNode,
  row: number,
  col: number,
) => {
  const map = TableMap.get(table);
  const boundedRow = Math.min(Math.max(row, 0), map.height - 1);
  const boundedCol = Math.min(Math.max(col, 0), map.width - 1);
  const cellPos = tableStart + map.positionAt(boundedRow, boundedCol, table);

  setSelectionNear(tr, cellPos + 1);
};

const dispatchTableReplacement = (
  view: EditorView,
  rect: TableRect,
  table: ProseMirrorNode,
  selectionCell?: { row: number; col: number },
) => {
  const tablePos = tablePositionFromRect(rect);
  const tableStart = tablePos + 1;
  const tr = view.state.tr.replaceWith(tablePos, tablePos + rect.table.nodeSize, table);

  if (selectionCell) {
    setSelectionInCell(tr, tableStart, table, selectionCell.row, selectionCell.col);
  } else {
    setSelectionNear(tr, tableStart);
  }

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

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
  getNodeType(state, "table_cell")?.createAndFill({ alignment }) ?? null;

const createTableFromRows = (
  state: EditorState,
  sourceTable: ProseMirrorNode,
  rows: ProseMirrorNode[],
) => {
  const tableType = getNodeType(state, "table");

  return tableType?.create(sourceTable.attrs, rows) ?? null;
};

const getRows = (table: ProseMirrorNode) =>
  Array.from({ length: table.childCount }, (_, index) => table.child(index));

const getCells = (row: ProseMirrorNode) =>
  Array.from({ length: row.childCount }, (_, index) => row.child(index));

const createBodyRow = (state: EditorState, table: ProseMirrorNode, width: number) => {
  const rowType = getNodeType(state, "table_row");
  const headerRow = table.firstChild;

  if (!rowType || !headerRow) {
    return null;
  }

  const cells = Array.from({ length: width }, (_, col) => {
    const headerCell = headerRow.maybeChild(col);

    return createBodyCell(state, headerCell?.attrs.alignment);
  });

  return cells.every(Boolean) ? rowType.create(null, cells as ProseMirrorNode[]) : null;
};

const addRow = (view: EditorView, placement: "above" | "below") => {
  const rect = getTableRect(view.state);

  if (!rect) {
    return false;
  }

  const row = createBodyRow(view.state, rect.table, rect.map.width);

  if (!row) {
    return false;
  }

  const rows = getRows(rect.table);
  const insertIndex = placement === "above" ? Math.max(1, rect.top) : Math.max(1, rect.bottom);

  rows.splice(insertIndex, 0, row);

  const nextTable = createTableFromRows(view.state, rect.table, rows);

  return nextTable
    ? dispatchTableReplacement(view, rect, nextTable, { row: insertIndex, col: rect.left })
    : false;
};

const createColumnCell = (state: EditorState, rowIndex: number, alignment: unknown) => {
  const cellType = getNodeType(state, rowIndex === 0 ? "table_header" : "table_cell");

  return cellType?.createAndFill({ alignment }) ?? null;
};

const addColumn = (view: EditorView, placement: "before" | "after") => {
  const rect = getTableRect(view.state);

  if (!rect) {
    return false;
  }

  const insertIndex = placement === "before" ? rect.left : rect.right;
  const rowTypeNames = ["table_header_row", ...Array(rect.table.childCount - 1).fill("table_row")];
  const rows = getRows(rect.table).map((row, rowIndex) => {
    const rowType = getNodeType(view.state, rowTypeNames[rowIndex]);
    const cellType = getNodeType(view.state, rowIndex === 0 ? "table_header" : "table_cell");
    const cells = getCells(row);
    const alignmentSourceIndex = Math.min(insertIndex, Math.max(cells.length - 1, 0));
    const cell = createColumnCell(
      view.state,
      rowIndex,
      cells[alignmentSourceIndex]?.attrs.alignment,
    );

    if (!rowType || !cellType || !cell) {
      return null;
    }

    cells.splice(insertIndex, 0, cell);

    return createRow(rowType, cellType, row, cells);
  });

  if (rows.some((row) => !row)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, rect.table, rows as ProseMirrorNode[]);

  return nextTable
    ? dispatchTableReplacement(view, rect, nextTable, { row: rect.top, col: insertIndex })
    : false;
};

const moveRows = (view: EditorView, direction: TableMoveDirection) => {
  const rect = getTableRect(view.state);

  if (!rect || !canMoveSelectedTableRows(view.state, direction)) {
    return false;
  }

  const rows = getRows(rect.table);
  const selectedRows = rows.splice(rect.top, rect.bottom - rect.top);
  const nextTop = direction === -1 ? rect.top - 1 : rect.top + 1;

  rows.splice(nextTop, 0, ...selectedRows);

  const nextTable = createTableFromRows(view.state, rect.table, rows);

  return nextTable
    ? dispatchTableReplacement(view, rect, nextTable, { row: nextTop, col: rect.left })
    : false;
};

const moveColumns = (view: EditorView, direction: TableMoveDirection) => {
  const rect = getTableRect(view.state);

  if (!rect || !canMoveSelectedTableColumns(view.state, direction)) {
    return false;
  }

  const nextLeft = direction === -1 ? rect.left - 1 : rect.left + 1;
  const rowTypeNames = ["table_header_row", ...Array(rect.table.childCount - 1).fill("table_row")];
  const rows = getRows(rect.table).map((row, rowIndex) => {
    const rowType = getNodeType(view.state, rowTypeNames[rowIndex]);
    const cellType = getNodeType(view.state, rowIndex === 0 ? "table_header" : "table_cell");
    const cells = getCells(row);
    const selectedCells = cells.splice(rect.left, rect.right - rect.left);

    if (!rowType || !cellType) {
      return null;
    }

    cells.splice(nextLeft, 0, ...selectedCells);

    return createRow(rowType, cellType, row, cells);
  });

  if (rows.some((row) => !row)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, rect.table, rows as ProseMirrorNode[]);

  return nextTable
    ? dispatchTableReplacement(view, rect, nextTable, { row: rect.top, col: nextLeft })
    : false;
};

const promoteRowToHeader = (state: EditorState, row: ProseMirrorNode) => {
  const rowType = getNodeType(state, "table_header_row");
  const cellType = getNodeType(state, "table_header");

  return rowType && cellType ? createRow(rowType, cellType, row, getCells(row)) : null;
};

const convertRowToBody = (state: EditorState, row: ProseMirrorNode) => {
  const rowType = getNodeType(state, "table_row");
  const cellType = getNodeType(state, "table_cell");

  return rowType && cellType ? createRow(rowType, cellType, row, getCells(row)) : null;
};

const deleteRows = (view: EditorView) => {
  const rect = getTableRect(view.state);

  if (!rect) {
    return false;
  }

  const rows = getRows(rect.table).filter((_, index) => index < rect.top || index >= rect.bottom);

  if (rows.length < 2) {
    return runProseMirrorTableCommand(view, deleteTable);
  }

  const [headerSource, ...bodySources] = rows;
  const headerRow = rect.top === 0 ? promoteRowToHeader(view.state, headerSource) : headerSource;
  const bodyRows = bodySources.map((row) => convertRowToBody(view.state, row));

  if (!headerRow || bodyRows.some((row) => !row)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, rect.table, [
    headerRow,
    ...(bodyRows as ProseMirrorNode[]),
  ]);

  return nextTable
    ? dispatchTableReplacement(view, rect, nextTable, {
        row: Math.min(rect.top, TableMap.get(nextTable).height - 1),
        col: rect.left,
      })
    : false;
};

const deleteColumns = (view: EditorView) => {
  const rect = getTableRect(view.state);

  if (!rect) {
    return false;
  }

  if (rect.left === 0 && rect.right === rect.map.width) {
    return runProseMirrorTableCommand(view, deleteTable);
  }

  const rowTypeNames = ["table_header_row", ...Array(rect.table.childCount - 1).fill("table_row")];
  const rows = getRows(rect.table).map((row, rowIndex) => {
    const rowType = getNodeType(view.state, rowTypeNames[rowIndex]);
    const cellType = getNodeType(view.state, rowIndex === 0 ? "table_header" : "table_cell");
    const cells = getCells(row).filter((_, index) => index < rect.left || index >= rect.right);

    if (!rowType || !cellType || cells.length === 0) {
      return null;
    }

    return createRow(rowType, cellType, row, cells);
  });

  if (rows.some((row) => !row)) {
    return false;
  }

  const nextTable = createTableFromRows(view.state, rect.table, rows as ProseMirrorNode[]);

  return nextTable
    ? dispatchTableReplacement(view, rect, nextTable, {
        row: rect.top,
        col: Math.min(rect.left, TableMap.get(nextTable).width - 1),
      })
    : false;
};

export const hasTableContext = (state: EditorState) => isInTable(state);

export const canMoveSelectedTableRows = (state: EditorState, direction: TableMoveDirection) => {
  const rect = getTableRect(state);

  if (!rect || rect.top === 0) {
    return false;
  }

  return direction === -1 ? rect.top > 1 : rect.bottom < rect.map.height;
};

export const canMoveSelectedTableColumns = (state: EditorState, direction: TableMoveDirection) => {
  const rect = getTableRect(state);

  if (!rect) {
    return false;
  }

  return direction === -1 ? rect.left > 0 : rect.right < rect.map.width;
};

export const runTableCommand = (view: EditorView, commandId: AppCommandId) => {
  if (!isTableCommandId(commandId)) {
    return false;
  }

  switch (commandId) {
    case "format.table.delete":
      return runProseMirrorTableCommand(view, deleteTable);

    case "format.table.addRowAbove":
      return addRow(view, "above");

    case "format.table.addRowBelow":
      return addRow(view, "below");

    case "format.table.addColumnBefore":
      return addColumn(view, "before");

    case "format.table.addColumnAfter":
      return addColumn(view, "after");

    case "format.table.moveRowUp":
      return moveRows(view, -1);

    case "format.table.moveRowDown":
      return moveRows(view, 1);

    case "format.table.moveColumnLeft":
      return moveColumns(view, -1);

    case "format.table.moveColumnRight":
      return moveColumns(view, 1);

    case "format.table.deleteRow":
      return deleteRows(view);

    case "format.table.deleteColumn":
      return deleteColumns(view);
  }
};

const isTableCommandId = (commandId: AppCommandId): commandId is TableCommandId =>
  commandId === "format.table.delete" ||
  commandId === "format.table.addRowAbove" ||
  commandId === "format.table.addRowBelow" ||
  commandId === "format.table.addColumnBefore" ||
  commandId === "format.table.addColumnAfter" ||
  commandId === "format.table.moveRowUp" ||
  commandId === "format.table.moveRowDown" ||
  commandId === "format.table.moveColumnLeft" ||
  commandId === "format.table.moveColumnRight" ||
  commandId === "format.table.deleteRow" ||
  commandId === "format.table.deleteColumn";
