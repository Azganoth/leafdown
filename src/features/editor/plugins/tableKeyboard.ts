import type { ResolvedPos } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, Selection, TextSelection } from "@milkdown/kit/prose/state";
import { goToNextCell } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { hasNoShortcutModifier } from "@/lib/input";

import { addRowBelow } from "../commands/formatting/tables";
import { runProseMirrorCommand } from "../utils/milkdown";
import { isTextCaretSelection } from "../utils/selections";
import {
  dispatchSelectedTableCellSelection,
  getSelectedTableRect,
  getTablePosition,
} from "../utils/tables";

export const leafdownTableKeyboardPluginKey = new PluginKey("leafdownTableKeyboard");

const moveToNextTableCell = (view: EditorView, direction: -1 | 1) =>
  runProseMirrorCommand(view, goToNextCell(direction));

const getTableCellDepth = ($pos: ResolvedPos) => {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const tableRole = $pos.node(depth).type.spec.tableRole;

    if (tableRole === "cell" || tableRole === "header_cell") {
      return depth;
    }
  }

  return null;
};

const isSelectionAtEndOfTableCell = (selection: TextSelection) => {
  const { $from } = selection;
  const cellDepth = getTableCellDepth($from);

  return (
    cellDepth !== null &&
    selection.empty &&
    selection.from === $from.end($from.depth) &&
    $from.after($from.depth) === $from.end(cellDepth)
  );
};

const handleTab = (view: EditorView, event: KeyboardEvent) => {
  if (!hasNoShortcutModifier(event)) {
    return false;
  }

  const rect = getSelectedTableRect(view.state);

  if (!rect) {
    return false;
  }

  event.preventDefault();

  if (event.shiftKey) {
    return moveToNextTableCell(view, -1);
  }

  if (rect.bottom === rect.map.height && rect.right === rect.map.width) {
    const nextRow = rect.map.height;

    if (!addRowBelow(view)) {
      return false;
    }

    return dispatchSelectedTableCellSelection(view, { row: nextRow, col: 0 });
  }

  return moveToNextTableCell(view, 1);
};

const handleEnter = (view: EditorView, event: KeyboardEvent) => {
  if (!hasNoShortcutModifier(event) || event.shiftKey) {
    return false;
  }

  const rect = getSelectedTableRect(view.state);

  if (!rect) {
    return false;
  }

  event.preventDefault();

  if (rect.bottom === rect.map.height) {
    return addRowBelow(view);
  }

  return dispatchSelectedTableCellSelection(view, { row: rect.bottom, col: rect.left });
};

const exitTableDownward = (view: EditorView) => {
  const rect = getSelectedTableRect(view.state);

  if (
    !rect ||
    rect.bottom !== rect.map.height ||
    !isTextCaretSelection(view.state.selection) ||
    !isSelectionAtEndOfTableCell(view.state.selection)
  ) {
    return false;
  }

  const tableEnd = getTablePosition(rect) + rect.table.nodeSize;
  const selectionAfterTable = Selection.findFrom(view.state.doc.resolve(tableEnd), 1, true);

  if (selectionAfterTable) {
    view.dispatch(view.state.tr.setSelection(selectionAfterTable).scrollIntoView());

    return true;
  }

  const paragraph = view.state.schema.nodes.paragraph?.createAndFill();

  if (!paragraph) {
    return false;
  }

  const tr = view.state.tr.insert(tableEnd, paragraph);
  const selection = Selection.findFrom(tr.doc.resolve(tableEnd + 1), 1, true);

  if (selection) {
    tr.setSelection(selection);
  }

  view.dispatch(tr.scrollIntoView());

  return true;
};

const handleArrowDown = (view: EditorView, event: KeyboardEvent) => {
  if (!hasNoShortcutModifier(event) || event.shiftKey) {
    return false;
  }

  const rect = getSelectedTableRect(view.state);

  if (!rect || rect.bottom !== rect.map.height || !isTextCaretSelection(view.state.selection)) {
    return false;
  }

  if (!isSelectionAtEndOfTableCell(view.state.selection)) {
    event.preventDefault();

    return true;
  }

  event.preventDefault();

  return exitTableDownward(view);
};

export const createLeafdownTableKeyboardPlugin = () =>
  $prose(
    () =>
      new Plugin({
        key: leafdownTableKeyboardPluginKey,
        props: {
          handleKeyDown: (view, event) => {
            switch (event.key) {
              case "Tab":
                return handleTab(view, event);

              case "Enter":
                return handleEnter(view, event);

              case "ArrowDown":
                return handleArrowDown(view, event);

              default:
                return false;
            }
          },
        },
      }),
  );
