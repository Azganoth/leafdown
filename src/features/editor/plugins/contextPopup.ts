import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

export const leafdownContextPopupPluginKey = new PluginKey("leafdownContextPopup");

export interface ContextPopupAnchor {
  x: number;
  top: number;
  bottom: number;
}

/** How the popup was opened. Only a keyboard open moves focus into it. */
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

const closePopup = ({ isOpen, onClose }: LeafdownContextPopupPluginOptions) => {
  if (!isOpen?.()) {
    return false;
  }

  onClose?.();

  return true;
};

const isEditablePopupTarget = (event: MouseEvent) =>
  event.target instanceof HTMLElement && event.target.closest("input, textarea, select") !== null;

// The platform keys that ask for a context menu. Handling them here rather than reading the
// contextmenu event they would produce keeps the two open paths distinguishable without
// inspecting a synthesized MouseEvent, which reports no button for a keyboard invocation.
const isContextMenuKey = (event: KeyboardEvent) =>
  event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey);

export const createLeafdownContextPopupPlugin = (options: LeafdownContextPopupPluginOptions = {}) =>
  $prose(() => {
    // An open popup keeps the source it was opened with, so refreshing its anchor against a
    // moved selection cannot downgrade a keyboard-opened popup to one that never took focus.
    let openSource: ContextPopupSource = "pointer";

    const requestSelectionPopup = (view: EditorView, source: ContextPopupSource) => {
      const anchor = getSelectionAnchor(view);

      if (!anchor) {
        return false;
      }

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
            // Also suppresses the contextmenu event the key would otherwise produce, so the
            // pointer path cannot reopen the popup underneath the keyboard one.
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
