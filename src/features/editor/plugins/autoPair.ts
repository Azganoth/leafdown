import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export const leafdownAutoPairPluginKey = new PluginKey("leafdownAutoPair");

const leafdownAutoPairs = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ['"', '"'],
  ["'", "'"],
]);

const leafdownClosingDelimiters = new Set(leafdownAutoPairs.values());

const getCharacter = (state: EditorState, from: number, to: number) => {
  if (from < 0 || to > state.doc.content.size || from >= to) {
    return "";
  }

  return state.doc.textBetween(from, to, "\n", "\n");
};

const isWordCharacter = (value: string) => /^[\p{L}0-9]$/u.test(value);

const shouldPairQuote = (state: EditorState, from: number, to: number) => {
  if (from !== to) {
    return true;
  }

  const previousCharacter = getCharacter(state, from - 1, from);
  return !isWordCharacter(previousCharacter);
};

const canHandleTextInput = (view: EditorView) => {
  const selection = view.state.selection;

  if (!(selection instanceof TextSelection) || !selection.$from.parent.isTextblock) {
    return false;
  }

  if (view.composing) {
    return false;
  }

  return selection.empty || selection.$from.sameParent(selection.$to);
};

const skipClosingDelimiter = (view: EditorView, from: number, to: number, text: string) => {
  if (from !== to || !leafdownClosingDelimiters.has(text)) {
    return false;
  }

  const nextCharacter = getCharacter(view.state, from, from + 1);

  if (nextCharacter !== text) {
    return false;
  }

  const transaction = view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1));
  view.dispatch(transaction.scrollIntoView());

  return true;
};

const insertPair = (
  view: EditorView,
  from: number,
  to: number,
  opening: string,
  closing: string,
) => {
  if (from === to) {
    const transaction = view.state.tr.insertText(`${opening}${closing}`, from, to);
    transaction.setSelection(TextSelection.create(transaction.doc, from + opening.length));
    view.dispatch(transaction.scrollIntoView());

    return true;
  }

  const transaction = view.state.tr.insertText(opening, from, from);
  transaction.insertText(closing, to + opening.length, to + opening.length);
  transaction.setSelection(
    TextSelection.create(transaction.doc, from + opening.length, to + opening.length),
  );
  view.dispatch(transaction.scrollIntoView());

  return true;
};

const deleteEmptyPair = (view: EditorView) => {
  const selection = view.state.selection;

  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false;
  }

  const { from } = selection;
  const previousCharacter = getCharacter(view.state, from - 1, from);
  const nextCharacter = getCharacter(view.state, from, from + 1);

  if (leafdownAutoPairs.get(previousCharacter) !== nextCharacter) {
    return false;
  }

  const transaction = view.state.tr.delete(from - 1, from + 1);
  view.dispatch(transaction.scrollIntoView());

  return true;
};

export const createLeafdownAutoPairPlugin = (getEnabled: () => boolean) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownAutoPairPluginKey,
        props: {
          handleKeyDown: (view, event) => {
            if (
              !getEnabled() ||
              event.key !== "Backspace" ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey
            ) {
              return false;
            }

            if (!deleteEmptyPair(view)) {
              return false;
            }

            event.preventDefault();
            return true;
          },
          handleTextInput: (view, from, to, text) => {
            if (!getEnabled() || text.length !== 1 || !canHandleTextInput(view)) {
              return false;
            }

            if (skipClosingDelimiter(view, from, to, text)) {
              return true;
            }

            const closing = leafdownAutoPairs.get(text);

            if (!closing) {
              return false;
            }

            if ((text === "'" || text === '"') && !shouldPairQuote(view.state, from, to)) {
              return false;
            }

            return insertPair(view, from, to, text, closing);
          },
        },
      }),
  );
