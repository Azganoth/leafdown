import type { Editor } from "@milkdown/kit/core";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { markdownToSlice } from "@milkdown/kit/utils";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

import {
  hasActiveSourceProjection,
  pasteIntoSourceProjection,
} from "../../plugins/sourceProjection";
import {
  deleteClipboardSelection,
  getDefaultClipboardPayload,
  type EditorClipboardPayload,
} from "../../utils/clipboard";
import { getEditorView } from "../../utils/milkdown";

type ClipboardPayload = Omit<EditorClipboardPayload, "html"> &
  Partial<Pick<EditorClipboardPayload, "html">>;

interface ClipboardWithRichAccess {
  read?: () => Promise<ClipboardItem[]>;
  readText: () => Promise<string>;
  write?: (data: ClipboardItem[]) => Promise<void>;
  writeText: (text: string) => Promise<void>;
}

type ClipboardCopyFormat = "default" | "markdown" | "plainText";
type ClipboardPasteFormat = "default" | "markdown" | "plainText" | "richText";

const getClipboard = (): ClipboardWithRichAccess | null => navigator.clipboard ?? null;

const getSelectedClipboardPayload = (
  view: EditorView,
  format: ClipboardCopyFormat,
): ClipboardPayload | null => {
  if (format === "default") {
    return getDefaultClipboardPayload(view);
  }

  if (view.state.selection.empty) {
    return null;
  }

  const slice = view.state.selection.content();

  if (format === "plainText") {
    return {
      text: slice.content.textBetween(0, slice.content.size, "\n\n"),
    };
  }

  const serializedSelection = view.serializeForClipboard(slice);

  if (format === "markdown") {
    return {
      text: serializedSelection.text,
    };
  }

  return {
    text: serializedSelection.text,
  };
};

const readClipboardHtml = async () => {
  const clipboard = getClipboard();

  if (!clipboard?.read) {
    return null;
  }

  const items = await clipboard.read();

  for (const item of items) {
    if (item.types.includes(TEXT_HTML_MIME_TYPE)) {
      return (await item.getType(TEXT_HTML_MIME_TYPE)).text();
    }
  }

  return null;
};

const writeClipboardPayload = async (payload: ClipboardPayload) => {
  const clipboard = getClipboard();

  if (!clipboard) {
    return false;
  }

  if (payload.html && clipboard.write && typeof ClipboardItem !== "undefined") {
    await clipboard.write([
      new ClipboardItem({
        [TEXT_HTML_MIME_TYPE]: new Blob([payload.html], { type: TEXT_HTML_MIME_TYPE }),
        [TEXT_PLAIN_MIME_TYPE]: new Blob([payload.text], { type: TEXT_PLAIN_MIME_TYPE }),
      }),
    ]);

    return true;
  }

  await clipboard.writeText(payload.text);

  return true;
};

const readClipboardText = () => getClipboard()?.readText() ?? null;

const pasteText = async (view: EditorView) => {
  const text = await readClipboardText();

  if (text === null) {
    return false;
  }

  view.focus();
  return view.pasteText(text);
};

const pasteMarkdown = async (editor: Editor, view: EditorView) => {
  const markdown = await readClipboardText();

  if (markdown === null) {
    return false;
  }

  const slice = editor.action(markdownToSlice(markdown));
  const tr = view.state.tr.replaceSelection(slice);

  view.focus();
  view.dispatch(tr.scrollIntoView());

  return true;
};

const pasteRichText = async (view: EditorView) => {
  const html = await readClipboardHtml();

  if (html) {
    view.focus();
    return view.pasteHTML(html);
  }

  return pasteText(view);
};

const pasteSourceProjectionText = async (view: EditorView) => {
  const text = await readClipboardText();
  if (text === null) {
    return false;
  }

  return pasteIntoSourceProjection(view, text);
};

/* Commands */

export const copySelection = (view: EditorView, format: ClipboardCopyFormat) => {
  const payload = getSelectedClipboardPayload(view, format);

  if (!payload) {
    return false;
  }

  return writeClipboardPayload(payload);
};

export const cutSelection = async (view: EditorView) => {
  const copiedState = view.state;
  const copiedProjectionWasActive = hasActiveSourceProjection(copiedState);
  const payload = getSelectedClipboardPayload(view, "default");

  if (!payload || !(await writeClipboardPayload(payload))) {
    return false;
  }

  const currentState = view.state;
  if (
    !currentState.doc.eq(copiedState.doc) ||
    !currentState.selection.eq(copiedState.selection) ||
    hasActiveSourceProjection(currentState) !== copiedProjectionWasActive
  ) {
    return false;
  }

  return deleteClipboardSelection(view, copiedProjectionWasActive);
};

export const paste = async (editor: Editor, format: ClipboardPasteFormat) => {
  const view = getEditorView(editor);
  if (hasActiveSourceProjection(view.state)) {
    return pasteSourceProjectionText(view);
  }

  switch (format) {
    case "plainText":
      return pasteText(view);
    case "markdown":
      return pasteMarkdown(editor, view);
    case "richText":
      return pasteRichText(view);
    case "default": {
      const html = await readClipboardHtml();

      if (html) {
        view.focus();
        return view.pasteHTML(html);
      }

      return pasteMarkdown(editor, view);
    }
  }
};

/* State */

export const canCopy = (state: EditorState) => !state.selection.empty;
