import { Plugin, PluginKey, Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import type { EditorContextPopupAnchor, EditorContextPopupRequest } from "../types";

export const leafdownContextPopupPluginKey = new PluginKey("leafdownContextPopup");

export interface LeafdownContextPopupPluginOptions {
  getContextPopupOpen?: () => boolean;
  onContextPopupClosed?: () => void;
  onContextPopupRequested?: (request: EditorContextPopupRequest) => void;
}

const hasPointerCoordinates = (event: MouseEvent) => event.clientX !== 0 || event.clientY !== 0;

const getSelectionAnchor = (view: EditorView): EditorContextPopupAnchor | null => {
  const { selection } = view.state;

  if (selection.empty) {
    return null;
  }

  try {
    const from = view.coordsAtPos(selection.from);
    const to = view.coordsAtPos(selection.to);

    return {
      x: Math.round((from.left + to.right) / 2),
      y: Math.round(Math.min(from.top, to.top)),
    };
  } catch {
    return null;
  }
};

const requestSelectionPopup = (
  view: EditorView,
  onContextPopupRequested: LeafdownContextPopupPluginOptions["onContextPopupRequested"],
) => {
  const anchor = getSelectionAnchor(view);

  if (!anchor) {
    return false;
  }

  onContextPopupRequested?.({
    anchor,
    source: "selection",
  });

  return true;
};

const closePopup = ({
  getContextPopupOpen,
  onContextPopupClosed,
}: LeafdownContextPopupPluginOptions) => {
  if (!getContextPopupOpen?.()) {
    return false;
  }

  onContextPopupClosed?.();

  return true;
};

const isEditablePopupTarget = (event: MouseEvent) =>
  event.target instanceof HTMLElement && Boolean(event.target.closest("input, textarea, select"));

const setCaretAtPointer = (view: EditorView, event: MouseEvent) => {
  if (!hasPointerCoordinates(event)) {
    return false;
  }

  const result = view.posAtCoords({ left: event.clientX, top: event.clientY });

  if (!result) {
    return false;
  }

  const { selection } = view.state;
  const clickInsideSelection =
    !selection.empty && selection.from <= result.pos && result.pos <= selection.to;

  if (clickInsideSelection) {
    return true;
  }

  const nextSelection = Selection.near(view.state.doc.resolve(result.pos));

  view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView());

  return true;
};

export const createLeafdownContextPopupPlugin = (options: LeafdownContextPopupPluginOptions = {}) =>
  $prose(
    () =>
      new Plugin({
        key: leafdownContextPopupPluginKey,
        props: {
          handleDOMEvents: {
            contextmenu: (view, event) => {
              if (!(event instanceof MouseEvent) || isEditablePopupTarget(event)) {
                return false;
              }

              event.preventDefault();
              setCaretAtPointer(view, event);
              view.focus();
              options.onContextPopupRequested?.({
                anchor: {
                  x: event.clientX,
                  y: event.clientY,
                },
                source: "rightClick",
              });

              return true;
            },
            mouseup: (view, event) => {
              if (!(event instanceof MouseEvent) || event.button !== 0) {
                return false;
              }

              window.requestAnimationFrame(() => {
                if (view.isDestroyed) {
                  return;
                }

                if (!requestSelectionPopup(view, options.onContextPopupRequested)) {
                  options.onContextPopupClosed?.();
                }
              });

              return false;
            },
          },
          handleKeyDown: (_view, event) => {
            if (event.key !== "Escape") {
              return false;
            }

            if (!closePopup(options)) {
              return false;
            }

            event.preventDefault();

            return true;
          },
          handleTextInput: () => {
            closePopup(options);

            return false;
          },
        },
      }),
  );
