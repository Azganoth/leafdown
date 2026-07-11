import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export const leafdownContextPopupPluginKey = new PluginKey("leafdownContextPopup");

export interface ContextPopupAnchor {
  x: number;
  top: number;
  bottom: number;
}

export interface LeafdownContextPopupPluginOptions {
  isOpen?: () => boolean;
  onClose?: () => void;
  onRequest?: (anchor: ContextPopupAnchor) => void;
}

const getSelectionAnchor = (view: EditorView): ContextPopupAnchor | null => {
  const { selection } = view.state;

  try {
    const from = view.coordsAtPos(selection.from, 1);
    const to = selection.empty ? from : view.coordsAtPos(selection.to, -1);

    return {
      x: Math.round((from.left + to.right) / 2),
      top: Math.round(from.top),
      bottom: Math.round(to.bottom),
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

  if (view.state.selection.empty || !requestSelectionPopup(view, options.onRequest)) {
    options.onClose?.();
  }
};

const isEditablePopupTarget = (event: MouseEvent) =>
  event.target instanceof HTMLElement && event.target.closest("input, textarea, select") !== null;

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
              view.focus();

              if (!requestSelectionPopup(view, options.onRequest)) {
                options.onClose?.();
              }

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

                if (view.state.selection.empty) {
                  closePopup(options);
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
