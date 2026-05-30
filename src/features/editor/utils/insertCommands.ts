import { Fragment, type Node as ProseMirrorNode, type NodeType } from "@milkdown/kit/prose/model";
import {
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { AppCommandId } from "@/features/commands/types";

type InsertCommandId =
  | "insert.paragraph"
  | "insert.heading1"
  | "insert.heading2"
  | "insert.heading3"
  | "insert.heading4"
  | "insert.heading5"
  | "insert.heading6"
  | "insert.image"
  | "insert.orderedList"
  | "insert.unorderedList"
  | "insert.taskList"
  | "insert.blockquote"
  | "insert.codeBlock"
  | "insert.table"
  | "insert.horizontalRule";

const imageMarker = "![]()";

const headingInsertLevels: Partial<Record<InsertCommandId, number>> = {
  "insert.heading1": 1,
  "insert.heading2": 2,
  "insert.heading3": 3,
  "insert.heading4": 4,
  "insert.heading5": 5,
  "insert.heading6": 6,
};

const getNodeType = (state: EditorState, nodeName: string) => state.schema.nodes[nodeName] ?? null;

const getInsertionPosAfterSelection = (state: EditorState) => {
  const { doc, selection } = state;
  let insertionPos = doc.content.size;
  let foundBlock = false;

  doc.forEach((node, pos) => {
    const nodeEnd = pos + node.nodeSize;
    const selectionTouchesNode = selection.empty
      ? selection.from >= pos && selection.from <= nodeEnd
      : pos < selection.to && nodeEnd > selection.from;

    if (!selectionTouchesNode) {
      return;
    }

    insertionPos = nodeEnd;
    foundBlock = true;
  });

  return foundBlock ? insertionPos : doc.content.size;
};

const createNode = (
  state: EditorState,
  nodeName: string,
  attrs: Record<string, unknown> | null = null,
) => getNodeType(state, nodeName)?.createAndFill(attrs) ?? null;

const createListNode = (
  state: EditorState,
  listNodeName: "bullet_list" | "ordered_list",
  checked: boolean | null = null,
) => {
  const listType = getNodeType(state, listNodeName);
  const listItemType = getNodeType(state, "list_item");
  const paragraph = createNode(state, "paragraph");

  if (!listType || !listItemType || !paragraph) {
    return null;
  }

  const listItem = listItemType.createAndFill({ checked }, paragraph);

  return listItem ? listType.createAndFill(null, listItem) : null;
};

const createWrappedParagraphNode = (state: EditorState, nodeName: string) => {
  const nodeType = getNodeType(state, nodeName);
  const paragraph = createNode(state, "paragraph");

  return nodeType && paragraph ? nodeType.createAndFill(null, paragraph) : null;
};

const createImageMarkdownParagraph = (state: EditorState) => {
  const paragraphType = getNodeType(state, "paragraph");

  return paragraphType?.create(null, state.schema.text(imageMarker)) ?? null;
};

const createTableCell = (cellType: NodeType) => cellType.createAndFill();

const createDefaultTableNode = (state: EditorState) => {
  const tableType = getNodeType(state, "table");
  const tableHeaderRowType = getNodeType(state, "table_header_row");
  const tableRowType = getNodeType(state, "table_row");
  const tableHeaderType = getNodeType(state, "table_header");
  const tableCellType = getNodeType(state, "table_cell");

  if (!tableType || !tableHeaderRowType || !tableRowType || !tableHeaderType || !tableCellType) {
    return null;
  }

  const headerCells = [createTableCell(tableHeaderType), createTableCell(tableHeaderType)];
  const bodyCells = [createTableCell(tableCellType), createTableCell(tableCellType)];

  if (headerCells.some((cell) => !cell) || bodyCells.some((cell) => !cell)) {
    return null;
  }

  const headerRow = tableHeaderRowType.create(null, headerCells as ProseMirrorNode[]);
  const bodyRow = tableRowType.create(null, bodyCells as ProseMirrorNode[]);

  return tableType.create(null, [headerRow, bodyRow]);
};

const createInsertNode = (state: EditorState, commandId: InsertCommandId) => {
  const headingLevel = headingInsertLevels[commandId];

  if (headingLevel) {
    return createNode(state, "heading", { level: headingLevel });
  }

  switch (commandId) {
    case "insert.paragraph":
      return createNode(state, "paragraph");

    case "insert.image":
      return createImageMarkdownParagraph(state);

    case "insert.orderedList":
      return createListNode(state, "ordered_list");

    case "insert.unorderedList":
      return createListNode(state, "bullet_list");

    case "insert.taskList":
      return createListNode(state, "bullet_list", false);

    case "insert.blockquote":
      return createWrappedParagraphNode(state, "blockquote");

    case "insert.codeBlock":
      return createNode(state, "code_block", { language: "" });

    case "insert.table":
      return createDefaultTableNode(state);

    case "insert.horizontalRule": {
      const hr = createNode(state, "hr");
      const paragraph = createNode(state, "paragraph");

      return hr && paragraph ? Fragment.fromArray([hr, paragraph]) : null;
    }
  }
};

const setSelectionNear = (tr: Transaction, position: number) => {
  const selection = Selection.findFrom(tr.doc.resolve(position), 1, true);

  if (selection) {
    tr.setSelection(selection);
  }
};

const setImageTargetSelection = (tr: Transaction, imageParagraphPos: number) => {
  tr.setSelection(TextSelection.create(tr.doc, imageParagraphPos + 1 + 4));
};

export const runInsertCommand = (view: EditorView, commandId: AppCommandId) => {
  if (!isInsertCommandId(commandId)) {
    return false;
  }

  const insertNode = createInsertNode(view.state, commandId);

  if (!insertNode) {
    return false;
  }

  const insertionPos = getInsertionPosAfterSelection(view.state);
  const tr = view.state.tr.insert(insertionPos, insertNode);

  if (commandId === "insert.image") {
    setImageTargetSelection(tr, insertionPos);
  } else if (commandId === "insert.horizontalRule") {
    setSelectionNear(tr, insertionPos + 2);
  } else {
    setSelectionNear(tr, insertionPos + 1);
  }

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

const isInsertCommandId = (commandId: AppCommandId): commandId is InsertCommandId =>
  commandId === "insert.paragraph" ||
  commandId === "insert.heading1" ||
  commandId === "insert.heading2" ||
  commandId === "insert.heading3" ||
  commandId === "insert.heading4" ||
  commandId === "insert.heading5" ||
  commandId === "insert.heading6" ||
  commandId === "insert.image" ||
  commandId === "insert.orderedList" ||
  commandId === "insert.unorderedList" ||
  commandId === "insert.taskList" ||
  commandId === "insert.blockquote" ||
  commandId === "insert.codeBlock" ||
  commandId === "insert.table" ||
  commandId === "insert.horizontalRule";
