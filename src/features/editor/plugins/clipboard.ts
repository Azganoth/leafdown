import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";

import { deleteClipboardSelection, getDefaultClipboardPayload } from "../utils/clipboard";

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

export const createLeafdownClipboardPlugin = () =>
  $prose(
    () =>
      new Plugin({
        props: {
          handleDOMEvents: {
            copy: (view, event) => handleClipboardEvent(view, event, false),
            cut: (view, event) => handleClipboardEvent(view, event, true),
          },
        },
      }),
  );
