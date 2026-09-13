import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

const TABLE_NODE_NAME = "table";
const FITTED_ATTRIBUTE_NAME = "data-leafdown-table-columns";

const getTableType = (state: EditorState) => state.schema.nodes[TABLE_NODE_NAME];

const findSelectedTablePosition = (state: EditorState) => {
  const tableType = getTableType(state);
  const { $from } = state.selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === tableType) {
      return $from.before(depth);
    }
  }

  return null;
};

// Measuring means letting the columns size themselves again first, which is why the widths are
// read with the previous fit taken off rather than through it.
const fitColumns = (table: HTMLTableElement) => {
  table.removeAttribute(FITTED_ATTRIBUTE_NAME);
  table.querySelector("colgroup")?.remove();

  const cells = table.querySelector("tbody tr")?.children;

  if (!cells?.length) {
    return;
  }

  const widths = [...cells].map((cell) => cell.getBoundingClientRect().width);

  // Before the first layout every column measures zero. Fitting to that would pin the table shut,
  // so it is left to size itself until something has a width to report.
  if (widths.some((width) => width <= 0)) {
    return;
  }

  const colgroup = document.createElement("colgroup");

  for (const width of widths) {
    colgroup.appendChild(document.createElement("col")).style.width = `${width}px`;
  }

  table.insertBefore(colgroup, table.firstChild);
  table.setAttribute(FITTED_ATTRIBUTE_NAME, "");
};

/**
 * A column sized to its content moves whenever that content changes, and opening a source
 * projection changes it. The columns are therefore fitted while the caret is elsewhere and held
 * as they are once it arrives, so whatever the caret opens is laid into widths already settled.
 *
 * The fit has to be standing before the caret lands: entering a projection is appended to the
 * transaction that moved the caret there, so by the time this runs the source is already shown.
 */
export const createLeafdownTableColumnsPlugin = () =>
  $prose(
    () =>
      new Plugin({
        view: (editorView) => {
          let fittedNodes = new WeakMap<HTMLTableElement, ProseMirrorNode>();
          let heldTable: HTMLTableElement | null = null;
          let lastWidth = 0;

          const sync = (refitAll = false) => {
            const { state } = editorView;
            const tableType = getTableType(state);
            // A table is only held against the caret that is actually in it. An unfocused editor
            // still reports a selection, and on open that selection sits at the start of the
            // document, which would leave a table there fitted to nothing.
            const selectedPosition = editorView.hasFocus()
              ? findSelectedTablePosition(state)
              : null;
            let nextHeld: HTMLTableElement | null = null;

            state.doc.descendants((node, position) => {
              if (node.type !== tableType) {
                return true;
              }

              const wrapper = editorView.nodeDOM(position);
              const table = wrapper instanceof HTMLElement ? wrapper.querySelector("table") : null;

              if (!table) {
                return false;
              }

              if (position === selectedPosition) {
                nextHeld = table;

                return false;
              }

              // A table the caret has just left is refitted even though nothing about it changed,
              // because what changed is that it can be measured again.
              if (
                refitAll ||
                table === heldTable ||
                !table.hasAttribute(FITTED_ATTRIBUTE_NAME) ||
                fittedNodes.get(table) !== node
              ) {
                fitColumns(table);
                fittedNodes.set(table, node);
              }

              return false;
            });

            heldTable = nextHeld;
          };

          // Refitting can change what the editor reports, so a measurement taken while a fit is
          // being applied is ignored rather than answered with another fit.
          let refitting = false;
          const observer =
            typeof ResizeObserver === "undefined"
              ? null
              : new ResizeObserver(() => {
                  const width = editorView.dom.clientWidth;

                  if (refitting || width === lastWidth) {
                    return;
                  }

                  lastWidth = width;
                  refitting = true;
                  requestAnimationFrame(() => {
                    fittedNodes = new WeakMap();
                    sync(true);
                    requestAnimationFrame(() => {
                      refitting = false;
                    });
                  });
                });

          observer?.observe(editorView.dom);
          sync();

          // Focus moving in or out of the editor decides which table is held, and neither arrives
          // as a transaction of its own.
          const handleFocusChange = () => sync();

          editorView.dom.addEventListener("focus", handleFocusChange);
          editorView.dom.addEventListener("blur", handleFocusChange);

          return {
            update: () => sync(),
            destroy: () => {
              observer?.disconnect();
              editorView.dom.removeEventListener("focus", handleFocusChange);
              editorView.dom.removeEventListener("blur", handleFocusChange);
            },
          };
        },
      }),
  );
