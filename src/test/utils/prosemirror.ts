import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Selection, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection, TableMap } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";

import type { TableCellCoordinates } from "@/features/editor";

import { createKeyboardEvent, type TestKeyboardEventOptions } from "./events";
import type { MountedMilkdownEditor } from "./milkdown";

/* Document */

export const getEditorTextContent = (mounted: MountedMilkdownEditor) =>
  mounted.view.state.doc.textContent;

export const getSelectedEditorText = (mounted: MountedMilkdownEditor) => {
  const { doc, selection } = mounted.view.state;

  return doc.textBetween(selection.from, selection.to, "\n", "\n");
};

export const getEditorTextPosition = (mounted: MountedMilkdownEditor, text: string) => {
  const textRanges: { end: number; from: number; start: number }[] = [];
  let documentText = "";

  mounted.view.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }

    const start = documentText.length;
    documentText += node.textContent;
    textRanges.push({
      end: documentText.length,
      from: pos,
      start,
    });

    return true;
  });

  const index = documentText.indexOf(text);

  if (index === -1) {
    throw new Error(`Could not find text: ${text}`);
  }

  const range = textRanges.find(({ end, start }) => start <= index && index < end);

  if (!range) {
    throw new Error(`Could not resolve text position: ${text}`);
  }

  return range.from + index - range.start;
};

export const getEditorNodePosition = (
  mounted: MountedMilkdownEditor,
  typeName: string,
  predicate: (node: ProseMirrorNode) => boolean = () => true,
) => {
  let position: number | null = null;

  mounted.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName || !predicate(node)) {
      return true;
    }

    position = pos;
    return false;
  });

  if (position === null) {
    throw new Error(`Could not find ${typeName} node.`);
  }

  return position;
};

/* DOM */

export function getEditorDomElement<K extends keyof HTMLElementTagNameMap>(
  mounted: MountedMilkdownEditor,
  selector: K,
): HTMLElementTagNameMap[K];
export function getEditorDomElement<K extends keyof SVGElementTagNameMap>(
  mounted: MountedMilkdownEditor,
  selector: K,
): SVGElementTagNameMap[K];
export function getEditorDomElement<E extends Element = Element>(
  mounted: MountedMilkdownEditor,
  selector: string,
): E;
export function getEditorDomElement(mounted: MountedMilkdownEditor, selector: string) {
  const element = mounted.view.dom.querySelector(selector);

  if (!element) {
    throw new Error(`Expected editor DOM to contain: ${selector}`);
  }

  return element;
}

/* Input */

export const typeText = (view: EditorView, text: string) => {
  for (const character of text) {
    const { from, to } = view.state.selection;
    const handled =
      view.someProp("handleTextInput", (handler) =>
        handler(view, from, to, character, () => view.state.tr.insertText(character, from, to)),
      ) ?? false;

    if (!handled) {
      view.dispatch(view.state.tr.insertText(character, from, to));
    }
  }
};

export const runKeyDownHandlers = (
  view: EditorView,
  key: string,
  init: TestKeyboardEventOptions = {},
) => {
  const event = createKeyboardEvent(key, init);
  const handled = view.someProp("handleKeyDown", (handler) => handler(view, event)) ?? false;

  return { event, handled };
};

/* Selection */

const getLastTextNode = (node: Node): Text | null => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node as Text;
  }

  for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
    const textNode = getLastTextNode(node.childNodes[index]);

    if (textNode) {
      return textNode;
    }
  }

  return null;
};

export const setTextSelection = (view: EditorView, anchor: number, head = anchor) => {
  const transaction = view.state.tr.setSelection(
    TextSelection.create(view.state.doc, anchor, head),
  );
  view.dispatch(transaction);
};

export const setSelectionAtDocumentEnd = (view: EditorView) => {
  const selection = TextSelection.atEnd(view.state.doc);
  view.dispatch(view.state.tr.setSelection(selection));
};

export const setSelectionAtElementTextEnd = (view: EditorView, element: Element) => {
  const textNode = getLastTextNode(element);

  if (!textNode) {
    throw new Error("Could not find a text node to place the ProseMirror selection.");
  }

  const position = view.posAtDOM(textNode, textNode.textContent?.length ?? 0);
  setTextSelection(view, position);

  return position;
};

/* Table */

const getFirstTable = (mounted: MountedMilkdownEditor) => {
  const tables: { node: ProseMirrorNode; start: number }[] = [];

  mounted.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") {
      return true;
    }

    tables.push({ node, start: pos + 1 });

    return false;
  });

  const table = tables[0];

  if (!table) {
    throw new Error("Expected a table in the mounted editor.");
  }

  return table;
};

export const getTableCellPos = (mounted: MountedMilkdownEditor, row: number, col: number) => {
  const table = getFirstTable(mounted);

  return table.start + TableMap.get(table.node).positionAt(row, col, table.node);
};

export const setSelectionInTableCell = (
  mounted: MountedMilkdownEditor,
  row: number,
  col: number,
) => {
  const cellPos = getTableCellPos(mounted, row, col);
  const selection = Selection.findFrom(mounted.view.state.doc.resolve(cellPos + 1), 1, true);

  if (!selection) {
    throw new Error("Could not place selection inside table cell.");
  }

  mounted.view.dispatch(mounted.view.state.tr.setSelection(selection));
};

export const setTableCellSelection = (
  mounted: MountedMilkdownEditor,
  anchor: TableCellCoordinates,
  head: TableCellCoordinates,
) => {
  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(
      new CellSelection(
        mounted.view.state.doc.resolve(getTableCellPos(mounted, anchor.row, anchor.col)),
        mounted.view.state.doc.resolve(getTableCellPos(mounted, head.row, head.col)),
      ),
    ),
  );
};

export const getTableCellTexts = (mounted: MountedMilkdownEditor) =>
  Array.from(mounted.view.dom.querySelectorAll("tr")).map((row) =>
    Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent ?? ""),
  );
