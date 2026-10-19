import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import {
  canMeasureSelection,
  createContextPopupAnchor,
  type ContextPopupAnchor,
} from "../utils/contextPopupAnchor";
import {
  getSelectedTableAxis,
  getSelectedTableRect,
  getTablePosition,
  setTableAxisSelection,
  type TableAxis,
  type TableAxisRange,
} from "../utils/tables";
import { isStructuralBlockSelection } from "./blockSelectionKeyboard";
import { TABLE_DRAGGING_ATTRIBUTE, TABLE_GRIP_SELECTOR } from "./tableControls";

export const leafdownContextPopupPluginKey = new PluginKey("leafdownContextPopup");

export type ContextPopupSource = "keyboard" | "pointer";

export type ContextPopupSelectionKind = "block" | "caret" | "text";

export type ContextPopupContainer = "code" | "table";

export interface ContextPopupTable {
  axis: TableAxis;
  row: TableAxisRange;
  column: TableAxisRange;
  selectAxis: (axis: TableAxis) => void;
}

export interface ContextPopupRequest {
  anchor: ContextPopupAnchor;
  container: ContextPopupContainer | null;
  selectionKind: ContextPopupSelectionKind;
  source: ContextPopupSource;
  table?: ContextPopupTable;
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

const getSelectionKind = (state: EditorState): ContextPopupSelectionKind => {
  if (isStructuralBlockSelection(state)) {
    return "block";
  }

  return state.selection.empty ? "caret" : "text";
};

const getContainer = ({ selection }: EditorState): ContextPopupContainer | null => {
  const { $from, to } = selection;

  for (let depth = $from.sharedDepth(to); depth > 0; depth -= 1) {
    const { spec } = $from.node(depth).type;

    if (spec.code) {
      return "code";
    }

    if (spec.tableRole === "table") {
      return "table";
    }
  }

  return null;
};

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
    let suppressPointerRelease = false;
    let pressedTableAxis: TableAxis | null = null;
    let tableScope:
      | (Omit<ContextPopupTable, "selectAxis"> & {
          table: EditorState["doc"];
          position: number;
          selection: EditorState["selection"];
        })
      | null = null;

    const readTable = (view: EditorView): ContextPopupTable | undefined => {
      const rect = getSelectedTableRect(view.state);

      if (!rect) return undefined;

      const position = getTablePosition(rect);
      if (
        !tableScope ||
        tableScope.table !== rect.table ||
        tableScope.position !== position ||
        !tableScope.selection.eq(view.state.selection)
      ) {
        tableScope = {
          axis:
            pressedTableAxis ??
            (getSelectedTableAxis(view.state, position, "column") &&
            !getSelectedTableAxis(view.state, position, "row")
              ? "column"
              : "row"),
          row: { from: rect.top, to: rect.bottom },
          column: { from: rect.left, to: rect.right },
          position,
          selection: view.state.selection,
          table: rect.table,
        };
      }

      if (pressedTableAxis) tableScope = { ...tableScope, axis: pressedTableAxis };
      pressedTableAxis = null;
      const scope = tableScope;
      return {
        axis: scope.axis,
        row: scope.row,
        column: scope.column,
        selectAxis: (axis) => {
          if (view.isDestroyed) return;
          const current = getSelectedTableRect(view.state);
          if (
            !current ||
            current.table !== scope.table ||
            getTablePosition(current) !== position ||
            !scope.selection.eq(view.state.selection)
          )
            return;

          const range = scope[axis];
          const tr = view.state.tr;
          setTableAxisSelection(
            tr,
            current.tableStart,
            current.table,
            axis,
            range.from,
            range.to - 1,
          );
          const changed = !tr.selection.eq(view.state.selection);
          tableScope = { ...scope, axis, selection: tr.selection };
          view.dispatch(tr);
          if (!changed) requestSelectionPopup(view, openSource);
        },
      };
    };

    const requestSelectionPopup = (view: EditorView, source: ContextPopupSource) => {
      if (!canMeasureSelection(view)) {
        return false;
      }

      anchor ??= createContextPopupAnchor(view);
      openSource = source;
      dismissed = false;
      const container = getContainer(view.state);
      if (container !== "table") tableScope = null;
      options.onRequest?.({
        anchor,
        container,
        selectionKind: getSelectionKind(view.state),
        source,
        ...(container === "table" ? { table: readTable(view) } : {}),
      });

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

    const handleRootMouseDown = (event: Event) => {
      if (
        event instanceof MouseEvent &&
        event.button === 0 &&
        event.target instanceof Element &&
        event.target.closest(`[data-leafdown-block-handle], ${TABLE_GRIP_SELECTOR}`)
      ) {
        pointerSelecting = true;
        suppressPointerRelease = false;
        const axis = event.target.closest(TABLE_GRIP_SELECTOR)?.getAttribute("data-axis");
        pressedTableAxis = axis === "row" || axis === "column" ? axis : null;
      }
    };

    const handleRootDragStart = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-leafdown-block-handle]")) {
        suppressPointerRelease = true;
      }
    };

    const handleRootDragEnd = () => {
      pointerSelecting = false;
      dismissed = true;
    };

    return new Plugin({
      key: leafdownContextPopupPluginKey,
      view: (editorView) => {
        const handleRootMouseUp = (event: Event) => {
          if (!(event instanceof MouseEvent) || event.button !== 0 || !pointerSelecting) {
            return;
          }

          const controlDragging =
            editorView.dom.hasAttribute("data-leafdown-block-dragging") ||
            editorView.dom.hasAttribute(TABLE_DRAGGING_ATTRIBUTE);
          window.requestAnimationFrame(() => {
            pointerSelecting = false;
            const suppressPopup = suppressPointerRelease;
            suppressPointerRelease = false;

            if (editorView.isDestroyed) {
              return;
            }

            if (suppressPopup || controlDragging) {
              dismissed = true;
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
        root.addEventListener("mousedown", handleRootMouseDown, true);
        root.addEventListener("mouseup", handleRootMouseUp);
        root.addEventListener("dragstart", handleRootDragStart);
        root.addEventListener("dragend", handleRootDragEnd);

        return {
          update: (view, previousState) => {
            syncPopupToSelection(view, previousState);
          },
          destroy: () => {
            root.removeEventListener("mousedown", handleRootMouseDown, true);
            root.removeEventListener("mouseup", handleRootMouseUp);
            root.removeEventListener("dragstart", handleRootDragStart);
            root.removeEventListener("dragend", handleRootDragEnd);
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
              suppressPointerRelease = false;
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
          suppressPointerRelease = true;
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
