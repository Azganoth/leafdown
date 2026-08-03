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

const SELECTION_MOVEMENT_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

// A shifted movement key extends the selection, and a modifier pressed before one belongs to the
// same gesture rather than ending it.
const continuesSelectionGesture = (event: KeyboardEvent) =>
  MODIFIER_KEYS.has(event.key) || (event.shiftKey && SELECTION_MOVEMENT_KEYS.has(event.key));

export const createLeafdownContextPopupPlugin = (options: LeafdownContextPopupPluginOptions = {}) =>
  $prose(() => {
    // Held so that refreshing an open popup's anchor cannot downgrade it to a pointer open.
    let openSource: ContextPopupSource = "pointer";
    // The anchor measures the live selection, so one per editor serves every request.
    let anchor: ContextPopupAnchor | null = null;
    // Latched by an explicit dismissal: `Escape` leaves the selection standing, so without this
    // the next keystroke of the same gesture would reopen what was just dismissed.
    let dismissed = false;
    // The pointer path opens on release, so the selection a drag builds must not open the popup.
    let pointerSelecting = false;

    const requestSelectionPopup = (view: EditorView, source: ContextPopupSource) => {
      if (!canMeasureSelection(view)) {
        return false;
      }

      anchor ??= createContextPopupAnchor(view);
      openSource = source;
      dismissed = false;
      options.onRequest?.({ anchor, source });

      return true;
    };

    const syncPopupToSelection = (view: EditorView, previousState: EditorView["state"]) => {
      const selectionChanged = !view.state.selection.eq(previousState.selection);
      const documentChanged = view.state.doc !== previousState.doc;

      if (!selectionChanged && !documentChanged) {
        return;
      }

      if (view.state.selection.empty) {
        // A collapsed selection outlives no gesture, so it releases the dismissal too.
        dismissed = false;

        if (options.isOpen?.()) {
          options.onClose?.();
        }

        return;
      }

      if (options.isOpen?.()) {
        if (!requestSelectionPopup(view, openSource)) {
          options.onClose?.();
        }

        return;
      }

      // A keyboard request would move focus into the popup and end the gesture that opened it,
      // so this stays a pointer one. An edit that leaves a selection standing is not one made.
      if (!documentChanged && !dismissed && !pointerSelecting) {
        requestSelectionPopup(view, "pointer");
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
          mousedown: (_view, event) => {
            if (event instanceof MouseEvent && event.button === 0) {
              pointerSelecting = true;
            }

            return false;
          },
          mouseup: (view, event) => {
            if (!(event instanceof MouseEvent) || event.button !== 0) {
              return false;
            }

            window.requestAnimationFrame(() => {
              pointerSelecting = false;

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
          // A keystroke means the drag is over, including one whose release the handler above
          // never saw because it landed outside the editor.
          pointerSelecting = false;

          if (isContextMenuKey(event)) {
            // Also suppresses the contextmenu event the key would produce, which would reopen
            // this popup through the pointer path.
            event.preventDefault();

            if (!requestSelectionPopup(view, "keyboard")) {
              options.onClose?.();
            }

            return true;
          }

          if (event.key === "Escape") {
            if (!closePopup(options)) {
              return false;
            }

            dismissed = true;
            event.preventDefault();

            return true;
          }

          if (!continuesSelectionGesture(event)) {
            dismissed = false;
          }

          return false;
        },
        handleTextInput: () => {
          closePopup(options);

          return false;
        },
      },
    });
  });
