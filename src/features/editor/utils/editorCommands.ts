import { editorViewCtx } from "@milkdown/kit/core";
import type { Editor } from "@milkdown/kit/core";
import { redo, undo } from "@milkdown/kit/prose/history";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Command } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
  chainCommands,
  deleteSelection,
  joinForward,
  selectAll,
  selectNodeForward,
  selectTextblockEnd,
  selectTextblockStart,
} from "@milkdown/kit/prose/commands";
import { markdownToSlice } from "@milkdown/kit/utils";

import type { AppCommandId } from "@/features/commands/types";

import {
  getTextWordRangeAfterSelection,
  getTextWordRangeAtSelection,
  getTextWordRangeBeforeSelection,
} from "./editorCommandState";
import { runBlockFormattingCommand } from "./blockFormattingCommands";
import { clearInlineFormatting, runInlineFormattingCommand } from "./inlineFormattingCommands";

const deleteForwardCommand = chainCommands(deleteSelection, joinForward, selectNodeForward);

interface ClipboardPayload {
  html?: string;
  text: string;
}

interface ClipboardWithOptionalRichAccess {
  read?: () => Promise<ClipboardItem[]>;
  readText: () => Promise<string>;
  write?: (data: ClipboardItem[]) => Promise<void>;
  writeText: (text: string) => Promise<void>;
}

type ClipboardCopyFormat = "default" | "markdown" | "plainText";
type ClipboardPasteFormat = "default" | "markdown" | "plainText" | "richText";

const runProseMirrorCommand = (view: EditorView, command: Command) => {
  view.focus();
  return command(view.state, view.dispatch, view);
};

const dispatchTextSelection = (view: EditorView, from: number, to = from) => {
  view.focus();
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView(),
  );

  return true;
};

const deleteNextTextCharacter = (view: EditorView) => {
  const { selection } = view.state;

  if (!(selection instanceof TextSelection) || !selection.$cursor) {
    return false;
  }

  const { $cursor } = selection;
  const textAfterCursor = $cursor.parent.textBetween(
    $cursor.parentOffset,
    $cursor.parent.content.size,
    "\n",
    "\n",
  );
  const nextCharacter = Array.from(textAfterCursor)[0];

  if (!nextCharacter) {
    return false;
  }

  view.dispatch(
    view.state.tr.delete($cursor.pos, $cursor.pos + nextCharacter.length).scrollIntoView(),
  );

  return true;
};

const deleteForward = (view: EditorView) =>
  runProseMirrorCommand(view, deleteForwardCommand) || deleteNextTextCharacter(view);

const deleteWordRange = (view: EditorView, getRange: typeof getTextWordRangeBeforeSelection) => {
  const range = getRange(view.state);

  if (!range) {
    return false;
  }

  view.focus();
  view.dispatch(view.state.tr.delete(range.from, range.to).scrollIntoView());

  return true;
};

const jumpToSelection = (view: EditorView) => {
  if (view.state.selection.empty) {
    return false;
  }

  view.focus();
  view.dispatch(view.state.tr.scrollIntoView());

  return true;
};

const getClipboard = (): ClipboardWithOptionalRichAccess | null => navigator.clipboard ?? null;

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

const writeClipboardPayload = async (payload: ClipboardPayload) => {
  const clipboard = getClipboard();

  if (!clipboard) {
    return false;
  }

  if (payload.html && clipboard.write && typeof ClipboardItem !== "undefined") {
    await clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([payload.html], { type: "text/html" }),
        "text/plain": new Blob([payload.text], { type: "text/plain" }),
      }),
    ]);

    return true;
  }

  await clipboard.writeText(payload.text);

  return true;
};

const copySelection = async (view: EditorView, format: ClipboardCopyFormat) => {
  const payload = getSelectedClipboardPayload(view, format);

  if (!payload) {
    return false;
  }

  return writeClipboardPayload(payload);
};

const cutSelection = async (view: EditorView) => {
  if (!(await copySelection(view, "default"))) {
    return false;
  }

  return runProseMirrorCommand(view, deleteSelection);
};

const readClipboardText = async () => {
  const clipboard = getClipboard();

  return clipboard ? clipboard.readText() : null;
};

const readClipboardHtml = async () => {
  const clipboard = getClipboard();

  if (!clipboard?.read) {
    return null;
  }

  const items = await clipboard.read();

  for (const item of items) {
    if (item.types.includes("text/html")) {
      return (await item.getType("text/html")).text();
    }
  }

  return null;
};

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

  view.focus();
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());

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

const pasteClipboard = async (editor: Editor, view: EditorView, format: ClipboardPasteFormat) => {
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

export const runEditorCommand = (editor: Editor, commandId: AppCommandId) => {
  const view = editor.ctx.get(editorViewCtx);
  const didRunInlineFormattingCommand = runInlineFormattingCommand(view, commandId);

  if (didRunInlineFormattingCommand) {
    return true;
  }

  const didRunBlockFormattingCommand = runBlockFormattingCommand(view, commandId);

  if (didRunBlockFormattingCommand) {
    return true;
  }

  switch (commandId) {
    case "edit.undo":
      return runProseMirrorCommand(view, undo);

    case "edit.redo":
      return runProseMirrorCommand(view, redo);

    case "edit.delete":
      return deleteForward(view);

    case "edit.deleteWordBackward":
      return deleteWordRange(view, getTextWordRangeBeforeSelection);

    case "edit.deleteWordForward":
      return deleteWordRange(view, getTextWordRangeAfterSelection);

    case "edit.selectAll":
      return runProseMirrorCommand(view, selectAll);

    case "edit.selectWord": {
      const range = getTextWordRangeAtSelection(view.state);

      return range ? dispatchTextSelection(view, range.from, range.to) : false;
    }

    case "edit.jumpToTop":
      return dispatchTextSelection(view, TextSelection.atStart(view.state.doc).from);

    case "edit.jumpToBottom":
      return dispatchTextSelection(view, TextSelection.atEnd(view.state.doc).from);

    case "edit.jumpToSelection":
      return jumpToSelection(view);

    case "edit.jumpToLineStart":
      return runProseMirrorCommand(view, selectTextblockStart);

    case "edit.jumpToLineEnd":
      return runProseMirrorCommand(view, selectTextblockEnd);

    case "edit.cut":
      return cutSelection(view);

    case "edit.copy":
      return copySelection(view, "default");

    case "edit.copyAsPlainText":
      return copySelection(view, "plainText");

    case "edit.copyAsMarkdown":
      return copySelection(view, "markdown");

    case "edit.paste":
      return pasteClipboard(editor, view, "default");

    case "edit.pasteAsPlainText":
      return pasteClipboard(editor, view, "plainText");

    case "edit.pasteAsMarkdown":
      return pasteClipboard(editor, view, "markdown");

    case "edit.pasteAsRichText":
      return pasteClipboard(editor, view, "richText");

    case "format.clearInline":
      return clearInlineFormatting(view);
  }

  return false;
};
