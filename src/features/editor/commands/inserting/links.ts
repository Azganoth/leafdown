import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

export const LINK_DESTINATION_MARKER = "()";
export const EMPTY_LINK_MARKER = `[]${LINK_DESTINATION_MARKER}`;

const LINK_TEXT_CURSOR_OFFSET = EMPTY_LINK_MARKER.indexOf("]");

const getLinkDestinationCursorOffset = (marker: string) => marker.indexOf(")");

export const insertLink = (view: EditorView) => {
  const { selection } = view.state;

  if (!(selection instanceof TextSelection)) {
    return false;
  }

  if (selection.empty) {
    const position = selection.from;
    const tr = view.state.tr.insertText(EMPTY_LINK_MARKER, position, position);

    tr.setSelection(TextSelection.create(tr.doc, position + LINK_TEXT_CURSOR_OFFSET));

    view.focus();
    view.dispatch(tr.scrollIntoView());

    return true;
  }

  if (!selection.$from.sameParent(selection.$to)) {
    return false;
  }

  const selectedText = selection.content().content.textBetween(0, selection.content().content.size);
  const marker = `[${selectedText}]${LINK_DESTINATION_MARKER}`;
  const tr = view.state.tr.insertText(marker, selection.from, selection.to);

  tr.setSelection(
    TextSelection.create(tr.doc, selection.from + getLinkDestinationCursorOffset(marker)),
  );

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

export interface InsertLinkTargetOptions {
  label: string;
  target: string;
}

export const insertLinkTarget = (view: EditorView, { label, target }: InsertLinkTargetOptions) => {
  const { selection, schema } = view.state;

  if (!(selection instanceof TextSelection)) {
    return false;
  }

  const selectedText = selection.empty
    ? label
    : selection.content().content.textBetween(0, selection.content().content.size);

  if (!selection.empty && !selection.$from.sameParent(selection.$to)) {
    return false;
  }

  const linkMark = schema.marks.link.create({ href: target });
  const tr = view.state.tr.replaceSelectionWith(schema.text(selectedText, [linkMark]), false);

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};
