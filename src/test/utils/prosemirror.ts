import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

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

export const setSelectionAtTextEnd = (view: EditorView, element: Element) => {
  const textNode = getLastTextNode(element);

  if (!textNode) {
    throw new Error("Could not find a text node to place the ProseMirror selection.");
  }

  const position = view.posAtDOM(textNode, textNode.textContent?.length ?? 0);
  setTextSelection(view, position);

  return position;
};

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

export const pressKey = (
  view: EditorView,
  key: string,
  init: Omit<KeyboardEventInit, "key"> = {},
) => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  });
  const handled = view.someProp("handleKeyDown", (handler) => handler(view, event)) ?? false;

  return { event, handled: Boolean(handled) };
};

export const dispatchKeyDown = (
  view: EditorView,
  key: string,
  init: Omit<KeyboardEventInit, "key"> = {},
) => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...init,
  });

  view.dom.dispatchEvent(event);

  return event;
};
