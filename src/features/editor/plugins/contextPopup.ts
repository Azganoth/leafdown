import { Plugin, PluginKey, Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { hasPointerCoordinates } from "@/lib/input";

export const leafdownContextPopupPluginKey = new PluginKey("leafdownContextPopup");

export interface ContextPopupAnchor {
  x: number;
  y: number;
}

export interface LeafdownContextPopupPluginOptions {
  isOpen?: () => boolean;
  onClose?: () => void;
  onRequest?: (anchor: ContextPopupAnchor) => void;
}

const getSelectionAnchor = (view: EditorView): ContextPopupAnchor | null => {
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
  onRequest: LeafdownContextPopupPluginOptions["onRequest"],
) => {
  const anchor = getSelectionAnchor(view);

  if (!anchor) {
    return false;
  }

  onRequest?.(anchor);

  return true;
};

const closePopup = ({ isOpen, onClose }: LeafdownContextPopupPluginOptions) => {
  if (!isOpen?.()) {
    return false;
  }

  onClose?.();

  return true;
};

const syncPopupToSelection = (
  view: EditorView,
  previousState: EditorView["state"],
  options: LeafdownContextPopupPluginOptions,
) => {
  if (!options.isOpen?.()) {
    return;
  }

  const selectionChanged = !view.state.selection.eq(previousState.selection);
  const documentChanged = view.state.doc !== previousState.doc;

  if (!selectionChanged && !documentChanged) {
    return;
  }

  if (!requestSelectionPopup(view, options.onRequest)) {
    options.onClose?.();
  }
};

const isEditablePopupTarget = (event: MouseEvent) =>
  event.target instanceof HTMLElement && event.target.closest("input, textarea, select") !== null;

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
        view: () => ({
          update: (view, previousState) => {
            syncPopupToSelection(view, previousState, options);
          },
        }),
        props: {
          handleDOMEvents: {
            contextmenu: (view, event) => {
              if (!(event instanceof MouseEvent) || isEditablePopupTarget(event)) {
                return false;
              }

              event.preventDefault();
              setCaretAtPointer(view, event);
              view.focus();
              options.onRequest?.({
                x: event.clientX,
                y: event.clientY,
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

                if (!requestSelectionPopup(view, options.onRequest)) {
                  options.onClose?.();
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
