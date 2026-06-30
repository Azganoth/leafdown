import { Fragment, type NodeType, type Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { areNonNullish } from "@/lib/predicates";

import { getNodeType, setSelectionNear } from "../../utils/milkdown";

export const IMAGE_MARKER = "![]()";

const TEXTBLOCK_CONTENT_START_OFFSET = 1;
const IMAGE_DESTINATION_CURSOR_OFFSET = IMAGE_MARKER.indexOf(")");

const canInsertFragmentAt = (state: EditorState, position: number, fragment: Fragment) => {
  const $position = state.doc.resolve(position);

  return $position.parent.canReplace($position.index(), $position.index(), fragment);
};

const getInsertionPosAfterSelection = (
  state: EditorState,
  insertNode: ProseMirrorNode | Fragment,
) => {
  const { doc, selection } = state;
  const fragment = Fragment.from(insertNode);
  const resolvePos = selection.empty ? selection.to : Math.max(selection.from, selection.to - 1);
  const $selectionEnd = doc.resolve(resolvePos);

  for (let depth = $selectionEnd.depth; depth > 0; depth -= 1) {
    const node = $selectionEnd.node(depth);

    if (!node.isBlock) {
      continue;
    }

    const insertionPos = $selectionEnd.after(depth);

    if (canInsertFragmentAt(state, insertionPos, fragment)) {
      return insertionPos;
    }
  }

  const docEnd = doc.content.size;

  if (!canInsertFragmentAt(state, docEnd, fragment)) {
    return null;
  }

  return docEnd;
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

  if (!listItem) {
    return null;
  }

  return listType.createAndFill(null, listItem);
};

const createWrappedParagraphNode = (state: EditorState, nodeName: string) => {
  const nodeType = getNodeType(state, nodeName);
  const paragraph = createNode(state, "paragraph");

  if (!nodeType || !paragraph) {
    return null;
  }

  return nodeType.createAndFill(null, paragraph);
};

const createImageMarkdownParagraph = (state: EditorState) =>
  getNodeType(state, "paragraph")?.create(null, state.schema.text(IMAGE_MARKER)) ?? null;

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

  if (!areNonNullish(headerCells) || !areNonNullish(bodyCells)) {
    return null;
  }

  const headerRow = tableHeaderRowType.create(null, headerCells);
  const bodyRow = tableRowType.create(null, bodyCells);

  return tableType.create(null, [headerRow, bodyRow]);
};

const setImageTargetSelection = (tr: Transaction, imageParagraphPos: number) => {
  tr.setSelection(
    TextSelection.create(
      tr.doc,
      imageParagraphPos + TEXTBLOCK_CONTENT_START_OFFSET + IMAGE_DESTINATION_CURSOR_OFFSET,
    ),
  );
};

const createHorizontalRuleFragment = (state: EditorState) => {
  const hr = createNode(state, "hr");
  const paragraph = createNode(state, "paragraph");

  if (!hr || !paragraph) {
    return null;
  }

  return Fragment.fromArray([hr, paragraph]);
};

const insertBlockAfterSelection = (
  view: EditorView,
  insertNode: ProseMirrorNode | Fragment | null,
  selection: "default" | "horizontalRule" | "image" = "default",
) => {
  if (!insertNode) {
    return false;
  }

  const insertionPos = getInsertionPosAfterSelection(view.state, insertNode);

  if (insertionPos === null) {
    return false;
  }

  const tr = view.state.tr.insert(insertionPos, insertNode);

  if (selection === "image") {
    setImageTargetSelection(tr, insertionPos);
  } else if (selection === "horizontalRule") {
    setSelectionNear(tr, insertionPos + 2);
  } else {
    setSelectionNear(tr, insertionPos + 1);
  }

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

/* Commands */

export const insertParagraph = (view: EditorView) =>
  insertBlockAfterSelection(view, createNode(view.state, "paragraph"));

export const insertHeading = (view: EditorView, level: 1 | 2 | 3 | 4 | 5 | 6) =>
  insertBlockAfterSelection(view, createNode(view.state, "heading", { level }));

export const insertImage = (view: EditorView) =>
  insertBlockAfterSelection(view, createImageMarkdownParagraph(view.state), "image");

export const insertOrderedList = (view: EditorView) =>
  insertBlockAfterSelection(view, createListNode(view.state, "ordered_list"));

export const insertUnorderedList = (view: EditorView) =>
  insertBlockAfterSelection(view, createListNode(view.state, "bullet_list"));

export const insertTaskList = (view: EditorView) =>
  insertBlockAfterSelection(view, createListNode(view.state, "bullet_list", false));

export const insertBlockquote = (view: EditorView) =>
  insertBlockAfterSelection(view, createWrappedParagraphNode(view.state, "blockquote"));

export const insertCodeBlock = (view: EditorView) =>
  insertBlockAfterSelection(view, createNode(view.state, "code_block", { language: "" }));

export const insertTable = (view: EditorView) =>
  insertBlockAfterSelection(view, createDefaultTableNode(view.state));

export const insertHorizontalRule = (view: EditorView) =>
  insertBlockAfterSelection(view, createHorizontalRuleFragment(view.state), "horizontalRule");
