import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import {
  canMeasureSelection,
  createContextPopupAnchor,
  type ContextPopupAnchor,
} from "../utils/contextPopupAnchor";

export const leafdownContextPopupPluginKey = new PluginKey("leafdownContextPopup");

export type ContextPopupSource = "keyboard" | "pointer";

export interface ContextPopupRequest {
  anchor: ContextPopupAnchor;
  source: ContextPopupSource;
}

export interface LeafdownContextPopupPluginOptions {
  isOpen?: () => boolean;
  onClose?: () => void;
  onRequest?: (request: ContextPopupRequest) => void;
}

const closePopup = ({ isOpen, onClose }: LeafdownContextPopupPluginOptions) => {
  if (!isOpen?.()) {
    return false;
  }

  onClose?.();

  return true;
};

const isEditablePopupTarget = (event: MouseEvent) =>
  event.target instanceof HTMLElement && event.target.closest("input, textarea, select") !== null;

const isContextMenuKey = (event: KeyboardEvent) =>
  event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);

export const createLeafdownContextPopupPlugin = (options: LeafdownContextPopupPluginOptions = {}) =>
  $prose(() => {
    // Held so that refreshing an open popup's anchor cannot downgrade it to a pointer open.
    let openSource: ContextPopupSource = "pointer";
    // The anchor measures the live selection, so one per editor serves every request.
    let anchor: ContextPopupAnchor | null = null;

    const requestSelectionPopup = (view: EditorView, source: ContextPopupSource) => {
      if (!canMeasureSelection(view)) {
        return false;
      }

      anchor ??= createContextPopupAnchor(view);
      openSource = source;
      options.onRequest?.({ anchor, source });

      return true;
    };

    const syncPopupToSelection = (view: EditorView, previousState: EditorView["state"]) => {
      if (!options.isOpen?.()) {
        return;
      }

      const selectionChanged = !view.state.selection.eq(previousState.selection);
      const documentChanged = view.state.doc !== previousState.doc;

      if (!selectionChanged && !documentChanged) {
        return;
      }

      if (view.state.selection.empty || !requestSelectionPopup(view, openSource)) {
        options.onClose?.();
      }
    };

    return new Plugin({
      key: leafdownContextPopupPluginKey,
      view: () => ({
        update: (view, previousState) => {
          syncPopupToSelection(view, previousState);
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

            if (!requestSelectionPopup(view, "pointer")) {
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

              if (!requestSelectionPopup(view, "pointer")) {
                options.onClose?.();
              }
            });

            return false;
          },
        },
        handleKeyDown: (view, event) => {
          if (isContextMenuKey(event)) {
            // Also suppresses the contextmenu event the key would produce, which would reopen
            // this popup through the pointer path.
            event.preventDefault();

            if (!requestSelectionPopup(view, "keyboard")) {
              options.onClose?.();
            }

            return true;
          }

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
    });
  });
