import { parserCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { isTextOnlySlice } from "@milkdown/kit/prose";
import { DOMParser, DOMSerializer, type Slice } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

import { deleteClipboardSelection, getDefaultClipboardPayload } from "../utils/clipboard";
import { isInsideTableCell, readCellCodeSpans } from "../utils/codeMarkdown";
import { readEnclosingInlineConstructs } from "../utils/logicalLinkMarkdown";
import { FRONTMATTER_NODE_NAME } from "./frontmatter";

const VSCODE_EDITOR_DATA_MIME_TYPE = "vscode-editor-data";

const parseFrontmatterPaste = (ctx: Ctx, text: string) => {
  if (!/^(?:---|\+\+\+|;;;)[\r\n]/u.test(text)) return null;
  const parsed = ctx.get(parserCtx)(text);
  return parsed &&
    typeof parsed !== "string" &&
    parsed.firstChild?.type.name === FRONTMATTER_NODE_NAME
    ? parsed
    : null;
};

const handleFrontmatterPaste = (
  ctx: Ctx,
  view: EditorView,
  event: ClipboardEvent,
  slice: Slice,
) => {
  const text = event.clipboardData?.getData(TEXT_PLAIN_MIME_TYPE);
  const { state } = view;
  if (
    !view.editable ||
    state.selection.from !== 1 ||
    state.doc.firstChild?.type.name === FRONTMATTER_NODE_NAME
  )
    return false;

  const parsed = text ? parseFrontmatterPaste(ctx, text) : null;
  const content =
    parsed?.content ??
    (slice.content.firstChild?.type.name === FRONTMATTER_NODE_NAME ? slice.content : null);
  if (!content) return false;

  const emptyDocument = state.doc.childCount === 1 && state.doc.firstChild?.textContent === "";
  const transaction = emptyDocument
    ? state.tr.replaceWith(0, state.doc.content.size, content)
    : state.tr.insert(0, content);
  view.dispatch(transaction.scrollIntoView());
  return true;
};

const handleClipboardEvent = (view: EditorView, event: Event, shouldDeleteSelection: boolean) => {
  const clipboardEvent = event as ClipboardEvent;
  const payload = getDefaultClipboardPayload(view);
  const clipboardData = clipboardEvent.clipboardData;

  if (!payload || !clipboardData) {
    return false;
  }

  clipboardEvent.preventDefault();

  try {
    clipboardData.clearData();
    clipboardData.setData(TEXT_HTML_MIME_TYPE, payload.html);
    clipboardData.setData(TEXT_PLAIN_MIME_TYPE, payload.text);
  } catch {
    return true;
  }

  if (shouldDeleteSelection) {
    deleteClipboardSelection(view);
  }

  return true;
};

// Milkdown's clipboard plugin parses pasted text as a document of its own, which keeps a code span's
// escaped pipes as content. Pasted into a cell, the text is read as the cell reads it, through the
// same parse and the same round trip through the DOM, and any paste that reading leaves unchanged is
// handed back to that plugin.
const handleCellTextPaste = (ctx: Ctx, view: EditorView, event: ClipboardEvent) => {
  const { clipboardData } = event;
  const text = clipboardData?.getData(TEXT_PLAIN_MIME_TYPE);

  if (
    !text ||
    clipboardData?.getData(TEXT_HTML_MIME_TYPE) ||
    clipboardData?.getData(VSCODE_EDITOR_DATA_MIME_TYPE) ||
    !view.editable ||
    !isInsideTableCell(readEnclosingInlineConstructs(view.state.selection.$from))
  ) {
    return false;
  }

  const parsed = ctx.get(parserCtx)(text);

  if (!parsed || typeof parsed === "string") {
    return false;
  }

  const read = readCellCodeSpans(parsed);

  if (read.eq(parsed)) {
    return false;
  }

  const { schema } = view.state;
  const slice = DOMParser.fromSchema(schema).parseSlice(
    DOMSerializer.fromSchema(schema).serializeFragment(read.content),
  );
  const node = isTextOnlySlice(slice);

  try {
    view.dispatch(
      node ? view.state.tr.replaceSelectionWith(node, true) : view.state.tr.replaceSelection(slice),
    );
  } catch {
    return false;
  }

  return true;
};

export const createLeafdownClipboardPlugin = () =>
  $prose(
    (ctx) =>
      new Plugin({
        props: {
          handleDOMEvents: {
            copy: (view, event) => handleClipboardEvent(view, event, false),
            cut: (view, event) => handleClipboardEvent(view, event, true),
          },
          handlePaste: (view, event, slice) =>
            handleFrontmatterPaste(ctx, view, event, slice) ||
            handleCellTextPaste(ctx, view, event),
        },
      }),
  );
