import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { MarkdownNode } from "@milkdown/kit/transformer";
import { $prose, $remark } from "@milkdown/kit/utils";

import { areNonNullish } from "@/lib/predicates";

import { getNodeType } from "../utils/milkdown";

const createEmptyMarkdownCell = (): MarkdownNode => ({ type: "tableCell", children: [] });

/// GFM renders a ragged table as the columns its header declares. Exported for colocated tests.
export const matchTableRowsToHeader = (tree: MarkdownNode) => {
  if (tree.type !== "table") {
    tree.children?.forEach(matchTableRowsToHeader);

    return;
  }

  const rows = tree.children;
  const width = rows?.[0]?.children?.length;

  if (!rows || width === undefined) {
    return;
  }

  rows.forEach((row, index) => {
    const cells = row.children ?? [];

    if (index === 0 || cells.length === width) {
      return;
    }

    row.children =
      cells.length > width
        ? cells.slice(0, width)
        : [...cells, ...Array.from({ length: width - cells.length }, createEmptyMarkdownCell)];
  });
};

const repairRow = (
  state: EditorState,
  headerRow: ProseMirrorNode,
  row: ProseMirrorNode,
  rowPos: number,
  transaction: Transaction | null,
) => {
  const cellType = getNodeType(state, "table_cell");

  if (!cellType) {
    return transaction;
  }

  const width = headerRow.childCount;
  const contentEnd = rowPos + row.nodeSize - 1;
  const tr = transaction ?? state.tr;

  if (row.childCount > width) {
    let cellStart = rowPos + 1;

    for (let index = 0; index < width; index += 1) {
      cellStart += row.child(index).nodeSize;
    }

    tr.delete(tr.mapping.map(cellStart), tr.mapping.map(contentEnd));

    return tr;
  }

  const cells = Array.from({ length: width - row.childCount }, (_, offset) =>
    cellType.createAndFill({
      alignment: headerRow.child(row.childCount + offset).attrs.alignment,
    }),
  );

  // Filling a row only partway leaves it to be repaired again on every transaction that follows.
  if (!areNonNullish(cells)) {
    return transaction;
  }

  tr.insert(tr.mapping.map(contentEnd), cells);

  return tr;
};

const repairTableRows = (
  state: EditorState,
  table: ProseMirrorNode,
  tablePos: number,
  transaction: Transaction | null,
) => {
  const headerRow = table.firstChild;

  if (!headerRow) {
    return transaction;
  }

  let tr = transaction;
  let rowPos = tablePos + 1;

  for (let index = 0; index < table.childCount; index += 1) {
    const row = table.child(index);

    if (index > 0 && row.childCount !== headerRow.childCount) {
      tr = repairRow(state, headerRow, row, rowPos, tr);
    }

    rowPos += row.nodeSize;
  }

  return tr;
};

export const createLeafdownTableShapePlugin = () =>
  $remark("leafdownTableShape", () => () => (tree) => {
    matchTableRowsToHeader(tree as MarkdownNode);
  });

/// The parser is not the only way a ragged table reaches the document; pasted HTML builds one
/// through `parseDOM`. Runs ahead of `prosemirror-tables`, whose own repair chooses which end of a
/// short row to fill from a rowspan heuristic and pushes authored cells into other columns.
export const createLeafdownTableShapeGuardPlugin = () =>
  $prose(
    () =>
      new Plugin({
        appendTransaction: (_transactions, oldState, state) => {
          if (oldState.doc === state.doc) {
            return null;
          }

          let tr: Transaction | null = null;

          state.doc.descendants((node, pos) => {
            if (node.type.spec.tableRole !== "table") {
              return true;
            }

            tr = repairTableRows(state, node, pos, tr);

            return false;
          });

          return tr;
        },
      }),
  );
