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
    // `Escape` leaves the selection standing, so without this the next keystroke that extends it
    // would reopen what was just dismissed.
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
        // The only release: an extension never collapses, and `Select all` has no gesture whose
        // end could serve instead.
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
      view: (editorView) => {
        const handleRootMouseUp = (event: Event) => {
          if (!(event instanceof MouseEvent) || event.button !== 0 || !pointerSelecting) {
            return;
          }

          window.requestAnimationFrame(() => {
            pointerSelecting = false;

            if (editorView.isDestroyed) {
              return;
            }

            if (editorView.state.selection.empty) {
              closePopup(options);
              return;
            }

            if (!requestSelectionPopup(editorView, "pointer")) {
              options.onClose?.();
            }
          });
        };

        const root = editorView.root;
        root.addEventListener("mouseup", handleRootMouseUp);

        return {
          update: (view, previousState) => {
            syncPopupToSelection(view, previousState);
          },
          destroy: () => {
            root.removeEventListener("mouseup", handleRootMouseUp);
          },
        };
      },
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
        },
        handleKeyDown: (view, event) => {
          // A keystroke means the drag is over, including one whose release the page never
          // received at all.
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

          if (event.key !== "Escape") {
            return false;
          }

          if (!closePopup(options)) {
            return false;
          }

          dismissed = true;
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
