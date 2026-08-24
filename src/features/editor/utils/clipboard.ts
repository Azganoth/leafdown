import { schemaCtx, serializerCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { isTextOnlySlice } from "@milkdown/kit/prose";
import type { EditorProps, EditorView } from "@milkdown/kit/prose/view";

import {
  deleteSourceProjectionSelection,
  getSourceProjectionClipboardSlice,
  hasActiveSourceProjection,
} from "../plugins/sourceProjection";

export interface EditorClipboardPayload {
  html: string;
  text: string;
}

const TRAILING_NEWLINE_PATTERN = /\n$/u;

// Milkdown's clipboard plugin writes a slice holding one unmarked text node as its own characters,
// so text the save path escapes reaches the clipboard as live Markdown. `someProp` moves on from a
// falsy result, which hands every other slice back to that plugin.
export const createClipboardTextSerializer =
  (ctx: Ctx): NonNullable<EditorProps["clipboardTextSerializer"]> =>
  (slice, view) => {
    if (!isTextOnlySlice(slice) || hasActiveSourceProjection(view.state)) {
      return "";
    }

    const doc = ctx.get(schemaCtx).topNodeType.createAndFill(undefined, slice.content);

    return doc ? ctx.get(serializerCtx)(doc).replace(TRAILING_NEWLINE_PATTERN, "") : "";
  };

export const getDefaultClipboardPayload = (view: EditorView): EditorClipboardPayload | null => {
  if (view.state.selection.empty) {
    return null;
  }

  const serializedSelection = view.serializeForClipboard(view.state.selection.content());
  const semanticSlice = getSourceProjectionClipboardSlice(view.state);
  const serializedHtml = semanticSlice
    ? view.serializeForClipboard(semanticSlice)
    : serializedSelection;

  return {
    html: serializedHtml.dom.innerHTML,
    text: serializedSelection.text,
  };
};

export const deleteClipboardSelection = (
  view: EditorView,
  sourceProjectionWasActive = hasActiveSourceProjection(view.state),
) => {
  if (sourceProjectionWasActive) {
    return deleteSourceProjectionSelection(view);
  }

  if (view.state.selection.empty) {
    return false;
  }

  view.focus();
  view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"));

  return true;
};
