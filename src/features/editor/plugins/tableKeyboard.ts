import { Plugin, PluginKey, Selection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { goToNextCell, isInTable, selectedRect, TableMap } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { runTableCommand } from "../utils/tableCommands";

export const leafdownTableKeyboardPluginKey = new PluginKey("leafdownTableKeyboard");

const isPlainKeyEvent = (event: KeyboardEvent) => !event.altKey && !event.ctrlKey && !event.metaKey;

const getTableRect = (state: EditorState) => (isInTable(state) ? selectedRect(state) : null);

const setSelectionNear = (view: EditorView, position: number) => {
  const selection = Selection.findFrom(view.state.doc.resolve(position), 1, true);

  if (!selection) {
    return false;
  }

  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());

  return true;
};

const setSelectionInTableCell = (view: EditorView, row: number, col: number) => {
  const rect = getTableRect(view.state);

  if (!rect) {
    return false;
  }

  const map = TableMap.get(rect.table);
  const boundedRow = Math.min(Math.max(row, 0), map.height - 1);
  const boundedCol = Math.min(Math.max(col, 0), map.width - 1);
  const cellPos = rect.tableStart + map.positionAt(boundedRow, boundedCol, rect.table);

  return setSelectionNear(view, cellPos + 1);
};

const moveToNextTableCell = (view: EditorView, direction: -1 | 1) => {
  view.focus();

  return goToNextCell(direction)(view.state, view.dispatch, view);
};

const handleTab = (view: EditorView, event: KeyboardEvent) => {
  if (!isPlainKeyEvent(event)) {
    return false;
  }

  const rect = getTableRect(view.state);

  if (!rect) {
    return false;
  }

  event.preventDefault();

  if (event.shiftKey) {
    return moveToNextTableCell(view, -1);
  }

  if (rect.bottom === rect.map.height && rect.right === rect.map.width) {
    const nextRow = rect.map.height;

    if (!runTableCommand(view, "format.table.addRowBelow")) {
      return false;
    }

    return setSelectionInTableCell(view, nextRow, 0);
  }

  return moveToNextTableCell(view, 1);
};

const handleEnter = (view: EditorView, event: KeyboardEvent) => {
  if (!isPlainKeyEvent(event) || event.shiftKey) {
    return false;
  }

  const rect = getTableRect(view.state);

  if (!rect) {
    return false;
  }

  event.preventDefault();

  if (rect.bottom === rect.map.height) {
    const nextRow = rect.map.height;

    if (!runTableCommand(view, "format.table.addRowBelow")) {
      return false;
    }

    return setSelectionInTableCell(view, nextRow, rect.left);
  }

  return setSelectionInTableCell(view, rect.bottom, rect.left);
};

const exitTableDownward = (view: EditorView) => {
  const rect = getTableRect(view.state);

  if (!rect || rect.bottom !== rect.map.height) {
    return false;
  }

  const tableEnd = tablePositionFromRect(rect) + rect.table.nodeSize;
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

const tablePositionFromRect = (rect: ReturnType<typeof selectedRect>) => rect.tableStart - 1;

const handleArrowDown = (view: EditorView, event: KeyboardEvent) => {
  if (!isPlainKeyEvent(event) || event.shiftKey) {
    return false;
  }

  const rect = getTableRect(view.state);

  if (!rect || rect.bottom !== rect.map.height) {
    return false;
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
