import type { Editor } from "@milkdown/kit/core";
import { deleteSelection } from "@milkdown/kit/prose/commands";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { markdownToSlice } from "@milkdown/kit/utils";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

import {
  hasActiveInlineSourceProjection,
  pasteIntoInlineSourceProjection,
} from "../../plugins/inlineSourceProjection";
import { getEditorView, runProseMirrorCommand } from "../../utils/milkdown";

interface ClipboardPayload {
  html?: string;
  text: string;
}

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
  if (view.state.selection.empty) {
    return null;
  }

  const slice = view.state.selection.content();

  if (format === "plainText") {
    return {
      text: slice.content.textBetween(0, slice.content.size, "\n\n"),
    };
  }

  const serialized = view.serializeForClipboard(slice);

  return {
    html: format === "default" ? serialized.dom.innerHTML : undefined,
    text: serialized.text,
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

const pasteInlineSourceProjectionText = async (view: EditorView) => {
  const text = await readClipboardText();
  if (text === null) {
    return false;
  }

  return pasteIntoInlineSourceProjection(view, text);
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
  if (!(await copySelection(view, "default"))) {
    return false;
  }

  return runProseMirrorCommand(view, deleteSelection);
};

export const paste = async (editor: Editor, format: ClipboardPasteFormat) => {
  const view = getEditorView(editor);
  if (hasActiveInlineSourceProjection(view.state)) {
    return pasteInlineSourceProjectionText(view);
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
