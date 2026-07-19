import type { EditorView } from "@milkdown/kit/prose/view";

import {
  deleteSourceProjectionSelection,
  getSourceProjectionClipboardSlice,
  hasActiveSourceProjection,
} from "../plugins/sourceProjection";

export interface EditorClipboardPayload {
  html: string;
  text: string;
}

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
