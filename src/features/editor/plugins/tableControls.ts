import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { localizer, t } from "@/lib/i18n";
import type { Disposable } from "@/lib/lifecycle";

import {
  canMoveTableColumnsTo,
  canMoveTableRowsTo,
  insertTableColumnAt,
  insertTableRowAt,
  moveTableColumnsTo,
  moveTableRowsTo,
} from "../commands/formatting/tables";
import {
  getEditorSurfaceElementAt,
  isEditorSurfaceElement,
  markEditorOverlay,
} from "../utils/editorSurface";
import { findScrollingAncestor } from "../utils/scrollingAncestor";
import {
  getSelectedTableAxis,
  setTableAxisSelection,
  type TableAxis,
  type TableAxisRange,
} from "../utils/tables";
import { finalizeSourceProjection } from "./sourceProjection";

export const leafdownTableControlsPluginKey = new PluginKey("leafdownTableControls");

export const TABLE_GRIP_SELECTOR = "[data-leafdown-table-grip]";
export const TABLE_DRAGGING_ATTRIBUTE = "data-leafdown-table-dragging";

const TABLE_DRAG_THRESHOLD = 5;
// Lets a control centered on the table's last border survive rounding against the scroll edge.
const VISIBLE_EDGE_TOLERANCE = 1;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

interface HoveredCell {
  table: HTMLTableElement;
  row: number;
  col: number;
}

interface TableGeometry {
  table: DOMRect;
  rows: DOMRect[];
  columns: DOMRect[];
  visibleLeft: number;
  visibleRight: number;
  rowControlsX: number;
  columnControlsY: number;
}

interface GripPress {
  axis: TableAxis;
  table: HTMLTableElement;
  range: TableAxisRange;
  collapseTo: number | null;
  x: number;
  y: number;
}

const getRowElements = (table: HTMLTableElement) =>
  Array.from(table.querySelector("tbody")?.children ?? []).filter(
    (element): element is HTMLTableRowElement => element.tagName === "TR",
  );

const getCellElements = (row: Element) =>
  Array.from(row.children).filter(
    (element): element is HTMLTableCellElement =>
      element.tagName === "TH" || element.tagName === "TD",
  );

const getRowBoundaryY = ({ rows }: TableGeometry, boundary: number) =>
  boundary < rows.length ? rows[boundary].top : rows[rows.length - 1].bottom;

const getColumnBoundaryX = ({ columns }: TableGeometry, boundary: number) =>
  boundary < columns.length ? columns[boundary].left : columns[columns.length - 1].right;

const findNearestBoundary = (
  first: number,
  last: number,
  distance: (boundary: number) => number,
) => {
  let nearest: number | null = null;
  let nearestDistance = Infinity;

  for (let boundary = first; boundary <= last; boundary += 1) {
    const boundaryDistance = distance(boundary);

    if (boundaryDistance < nearestDistance) {
      nearest = boundary;
      nearestDistance = boundaryDistance;
    }
  }

  return nearest;
};

const createIcon = (doc: Document, draw: (svg: SVGSVGElement) => void) => {
  const svg = doc.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  draw(svg);
  return svg;
};

const drawPlus = (svg: SVGSVGElement) => {
  const path = svg.ownerDocument.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", "M12 5v14m-7-7h14");
  svg.append(path);
};

const createControl = (doc: Document, className: string, axis: TableAxis) => {
  const control = doc.createElement("button");
  control.className = className;
  control.type = "button";
  control.tabIndex = -1;
  control.hidden = true;
  control.dataset.axis = axis;
  return control;
};

const getOverlayOwner = (view: EditorView) =>
  view.root.nodeType === Node.DOCUMENT_NODE ? (view.root as Document).body : view.root;

const getTablePos = (view: EditorView, table: HTMLTableElement) => {
  const cell = table.querySelector("th, td");

  if (!cell || !view.dom.contains(cell)) {
    return null;
  }

  const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0));

  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.spec.tableRole === "table") {
      return $pos.before(depth);
    }
  }

  return null;
};

const getCellCoordinates = (cell: HTMLTableCellElement, table: HTMLTableElement) => {
  const row = cell.parentElement;
  const rowIndex = row ? getRowElements(table).indexOf(row as HTMLTableRowElement) : -1;
  const colIndex = row ? getCellElements(row).indexOf(cell) : -1;

  return rowIndex < 0 || colIndex < 0 ? null : { row: rowIndex, col: colIndex };
};

class TableControlsView {
  private readonly layer: HTMLDivElement;
  private readonly rowGrip: HTMLButtonElement;
  private readonly columnGrip: HTMLButtonElement;
  private readonly rowInsert: HTMLButtonElement;
  private readonly columnInsert: HTMLButtonElement;
  private readonly indicator: HTMLDivElement;
  private readonly localizationChange: Disposable;
  private hovered: HoveredCell | null = null;
  private rowBoundary: number | null = null;
  private columnBoundary: number | null = null;
  private indicatedInsertion: TableAxis | null = null;
  private press: GripPress | null = null;
  private dragging = false;
  private dropBoundary: number | null = null;
  private pointer: { x: number; y: number } | null = null;
  private surface: DOMRect | null = null;
  private animationFrame: number | null = null;

  constructor(private view: EditorView) {
    const doc = view.dom.ownerDocument;
    this.layer = doc.createElement("div");
    this.layer.className = "leafdown-table-controls-layer";
    markEditorOverlay(view, this.layer);

    this.indicator = doc.createElement("div");
    this.indicator.className = "leafdown-table-indicator";
    this.indicator.hidden = true;

    this.rowGrip = createControl(doc, "leafdown-table-grip", "row");
    this.columnGrip = createControl(doc, "leafdown-table-grip", "column");
    this.rowInsert = createControl(doc, "leafdown-table-insert-button", "row");
    this.columnInsert = createControl(doc, "leafdown-table-insert-button", "column");

    for (const grip of [this.rowGrip, this.columnGrip]) {
      grip.dataset.leafdownTableGrip = "";
      grip.addEventListener("mousedown", this.handleGripMouseDown);
      grip.addEventListener("mouseup", this.handleGripMouseUp);
    }

    for (const button of [this.rowInsert, this.columnInsert]) {
      button.dataset.leafdownTableInsert = "";
      button.append(createIcon(doc, drawPlus));
      button.addEventListener("mouseenter", this.showInsertionIndicator);
      button.addEventListener("mouseleave", this.hideInsertionIndicator);
      button.addEventListener("mousedown", this.preventMouseDown);
      button.addEventListener("click", this.handleInsertClick);
    }

    this.label();
    this.layer.append(
      this.indicator,
      this.rowInsert,
      this.columnInsert,
      this.rowGrip,
      this.columnGrip,
    );
    getOverlayOwner(view).append(this.layer);

    doc.addEventListener("mousemove", this.handlePointerMove);
    doc.addEventListener("mouseup", this.handleDocumentMouseUp);
    doc.addEventListener("mouseleave", this.handlePointerLeave);
    doc.defaultView?.addEventListener("blur", this.handlePointerLeave);
    doc.defaultView?.addEventListener("resize", this.scheduleRefresh);
    view.root.addEventListener("scroll", this.scheduleRefresh, true);
    this.localizationChange = localizer.onDidChange(this.label);
  }

  update(view: EditorView, previousState: EditorView["state"]) {
    this.view = view;

    if (view.state.doc !== previousState.doc || !view.state.selection.eq(previousState.selection)) {
      this.scheduleRefresh();
    }
  }

  destroy() {
    const doc = this.view.dom.ownerDocument;
    this.localizationChange.dispose();
    doc.removeEventListener("mousemove", this.handlePointerMove);
    doc.removeEventListener("mouseup", this.handleDocumentMouseUp);
    doc.removeEventListener("mouseleave", this.handlePointerLeave);
    doc.defaultView?.removeEventListener("blur", this.handlePointerLeave);
    doc.defaultView?.removeEventListener("resize", this.scheduleRefresh);
    this.view.root.removeEventListener("scroll", this.scheduleRefresh, true);

    if (this.animationFrame !== null) {
      doc.defaultView?.cancelAnimationFrame(this.animationFrame);
    }

    this.endPress();
    this.layer.remove();
  }

  private readonly label = () => {
    this.rowGrip.setAttribute("aria-label", t("editor.tableControls.rowGrip"));
    this.columnGrip.setAttribute("aria-label", t("editor.tableControls.columnGrip"));
    this.rowInsert.setAttribute("aria-label", t("editor.tableControls.insertRow"));
    this.columnInsert.setAttribute("aria-label", t("editor.tableControls.insertColumn"));
  };

  private readonly scheduleRefresh = () => {
    const frame = this.view.dom.ownerDocument.defaultView?.requestAnimationFrame;

    if (!frame || this.animationFrame !== null) {
      return;
    }

    this.animationFrame = frame(() => {
      this.animationFrame = null;
      this.refresh();
    });
  };

  // Content moved under a pointer that held still, so what it is over is found again.
  private refresh() {
    if (this.press) {
      return;
    }

    if (!this.pointer) {
      return this.clear();
    }

    const { x, y } = this.pointer;
    this.resolveHover(x, y, this.view.dom.ownerDocument.elementFromPoint?.(x, y) ?? null);
  }

  private clear() {
    this.hovered = null;
    this.rowBoundary = null;
    this.columnBoundary = null;
    this.indicatedInsertion = null;

    for (const element of [
      this.rowGrip,
      this.columnGrip,
      this.rowInsert,
      this.columnInsert,
      this.indicator,
    ]) {
      element.hidden = true;
    }
  }

  private measureSurface() {
    this.surface = findScrollingAncestor(this.view.dom)?.getBoundingClientRect() ?? null;

    if (!this.surface) {
      this.layer.style.removeProperty("clip-path");
      return;
    }

    const layer = this.layer.getBoundingClientRect();
    const insets = [
      this.surface.top - layer.top,
      layer.right - this.surface.right,
      layer.bottom - this.surface.bottom,
      this.surface.left - layer.left,
    ];
    this.layer.style.clipPath = `inset(${insets.map((inset) => `${String(Math.max(inset, 0))}px`).join(" ")})`;
  }

  private isInSurface(x: number, y: number) {
    const { surface } = this;
    return (
      !surface ||
      (x >= surface.left && x <= surface.right && y >= surface.top && y <= surface.bottom)
    );
  }

  private measure(table: HTMLTableElement): TableGeometry | null {
    const rowElements = getRowElements(table);
    const headerCells = rowElements[0] ? getCellElements(rowElements[0]) : [];

    if (rowElements.length === 0 || headerCells.length === 0) {
      return null;
    }

    const tableRect = table.getBoundingClientRect();
    const scroller = table.parentElement?.getBoundingClientRect() ?? tableRect;
    const visibleLeft = Math.max(scroller.left, this.surface?.left ?? -Infinity);
    const visibleRight = Math.min(scroller.right, this.surface?.right ?? Infinity);

    return {
      table: tableRect,
      rows: rowElements.map((row) => row.getBoundingClientRect()),
      columns: headerCells.map((cell) => cell.getBoundingClientRect()),
      visibleLeft,
      visibleRight,
      rowControlsX: Math.max(tableRect.left, visibleLeft),
      columnControlsY: Math.min(
        Math.max(tableRect.top, this.surface?.top ?? -Infinity),
        tableRect.bottom,
      ),
    };
  }

  private isColumnVisible(geometry: TableGeometry, x: number) {
    return (
      x >= geometry.visibleLeft - VISIBLE_EDGE_TOLERANCE &&
      x <= geometry.visibleRight + VISIBLE_EDGE_TOLERANCE
    );
  }

  private findRowBoundary(geometry: TableGeometry, y: number) {
    return findNearestBoundary(1, geometry.rows.length, (boundary) =>
      Math.abs(getRowBoundaryY(geometry, boundary) - y),
    );
  }

  private findColumnBoundary(geometry: TableGeometry, x: number) {
    return findNearestBoundary(0, geometry.columns.length, (boundary) => {
      const boundaryX = getColumnBoundaryX(geometry, boundary);
      return this.isColumnVisible(geometry, boundaryX) ? Math.abs(boundaryX - x) : Infinity;
    });
  }

  // A pointer resting on one of these controls keeps the cell and boundaries that showed them, so
  // moving onto the row grip, which overlaps the first column, leaves the column controls be.
  private resolveHover(x: number, y: number, target: EventTarget | null) {
    this.measureSurface();

    if (!this.isInSurface(x, y)) {
      return this.clear();
    }

    const onControl = target instanceof Node && this.layer.contains(target);
    const element = getEditorSurfaceElementAt(this.view, x, y);

    if (!onControl && !isEditorSurfaceElement(this.view, element)) {
      return this.clear();
    }

    if (onControl && this.hovered?.table.isConnected) {
      return this.render(null);
    }

    const cell = element?.closest<HTMLTableCellElement>("th, td");
    const table = cell?.closest("table");

    if (!cell || !table || !this.view.dom.contains(table)) {
      return this.clear();
    }

    const coordinates = getCellCoordinates(cell, table);

    if (!coordinates) {
      return this.clear();
    }

    this.hovered = { table, ...coordinates };
    this.render({ x, y });
  }

  // `pointer` places the insertion buttons at the boundaries nearest it; without one they keep
  // their boundaries.
  private render(pointer: { x: number; y: number } | null) {
    const hovered = this.hovered;
    const geometry = hovered ? this.measure(hovered.table) : null;

    if (!hovered || !geometry) {
      return this.clear();
    }

    const rowCount = geometry.rows.length;
    const columnCount = geometry.columns.length;

    if (pointer) {
      this.rowBoundary = this.findRowBoundary(geometry, pointer.y);
      this.columnBoundary = this.findColumnBoundary(geometry, pointer.x);
    } else {
      if (this.rowBoundary !== null && this.rowBoundary > rowCount) this.rowBoundary = null;
      if (this.columnBoundary !== null && this.columnBoundary > columnCount)
        this.columnBoundary = null;
    }

    const row = geometry.rows.at(hovered.row);
    const column = geometry.columns.at(hovered.col);
    const columnCenter = column ? column.left + column.width / 2 : NaN;
    const tablePos = getTablePos(this.view, hovered.table);
    for (const [axis, grip, index] of [
      ["row", this.rowGrip, hovered.row],
      ["column", this.columnGrip, hovered.col],
    ] as const) {
      const range =
        tablePos === null ? null : getSelectedTableAxis(this.view.state, tablePos, axis);
      grip.toggleAttribute(
        "data-selected",
        range !== null && index >= range.from && index < range.to,
      );
    }

    this.place(
      this.rowGrip,
      geometry.rowControlsX,
      row ? row.top + row.height / 2 : NaN,
      hovered.row >= 1 && row !== undefined,
    );
    this.place(
      this.columnGrip,
      columnCenter,
      geometry.columnControlsY,
      column !== undefined && this.isColumnVisible(geometry, columnCenter),
    );

    const showInsertion = !this.dragging;
    const rowBoundaryY =
      this.rowBoundary === null ? NaN : getRowBoundaryY(geometry, this.rowBoundary);
    const columnBoundaryX =
      this.columnBoundary === null ? NaN : getColumnBoundaryX(geometry, this.columnBoundary);

    this.place(this.rowInsert, geometry.rowControlsX, rowBoundaryY, showInsertion);
    this.place(this.columnInsert, columnBoundaryX, geometry.columnControlsY, showInsertion);

    if (this.dragging) {
      return this.renderDropIndicator(geometry);
    }

    if (this.indicatedInsertion === "row" && Number.isFinite(rowBoundaryY)) {
      this.placeIndicator(geometry, "row", rowBoundaryY, false);
    } else if (this.indicatedInsertion === "column" && Number.isFinite(columnBoundaryX)) {
      this.placeIndicator(geometry, "column", columnBoundaryX, false);
    } else {
      this.indicator.hidden = true;
    }
  }

  private place(control: HTMLElement, x: number, y: number, visible: boolean) {
    control.hidden = !visible || !Number.isFinite(x) || !Number.isFinite(y);

    if (!control.hidden) {
      control.style.left = `${String(x)}px`;
      control.style.top = `${String(y)}px`;
    }
  }

  private placeIndicator(geometry: TableGeometry, axis: TableAxis, at: number, drop: boolean) {
    const { style } = this.indicator;
    this.indicator.hidden = false;
    this.indicator.dataset.axis = axis;
    this.indicator.toggleAttribute("data-drop", drop);

    if (axis === "row") {
      const left = Math.max(geometry.table.left, geometry.visibleLeft);
      const right = Math.min(geometry.table.right, geometry.visibleRight);
      style.left = `${String(left)}px`;
      style.top = `${String(at)}px`;
      style.width = `${String(Math.max(right - left, 0))}px`;
      style.removeProperty("height");
    } else {
      style.left = `${String(at)}px`;
      style.top = `${String(geometry.table.top)}px`;
      style.height = `${String(geometry.table.height)}px`;
      style.removeProperty("width");
    }
  }

  private renderDropIndicator(geometry: TableGeometry) {
    const press = this.press;

    if (!press || this.dropBoundary === null) {
      this.indicator.hidden = true;
      return;
    }

    this.placeIndicator(
      geometry,
      press.axis,
      press.axis === "row"
        ? getRowBoundaryY(geometry, this.dropBoundary)
        : getColumnBoundaryX(geometry, this.dropBoundary),
      true,
    );
  }

  private readonly handlePointerMove = (event: MouseEvent) => {
    this.pointer = { x: event.clientX, y: event.clientY };

    if (this.press) {
      return this.handleDragMove(event);
    }

    this.resolveHover(event.clientX, event.clientY, event.target);
  };

  private readonly handlePointerLeave = () => {
    this.pointer = null;
    this.endPress();
    this.clear();
  };

  private readonly showInsertionIndicator = (event: MouseEvent) => {
    this.indicatedInsertion = event.currentTarget === this.rowInsert ? "row" : "column";
    this.render(null);
  };

  private readonly hideInsertionIndicator = () => {
    this.indicatedInsertion = null;
    this.indicator.hidden = true;
  };

  private readonly preventMouseDown = (event: MouseEvent) => event.preventDefault();

  private runAtTable(table: HTMLTableElement, command: (tablePos: number) => boolean) {
    finalizeSourceProjection(this.view);
    const tablePos = getTablePos(this.view, table);

    return tablePos === null ? false : command(tablePos);
  }

  private readonly handleInsertClick = (event: MouseEvent) => {
    const table = this.hovered?.table;
    const axis = event.currentTarget === this.rowInsert ? "row" : "column";
    const boundary = axis === "row" ? this.rowBoundary : this.columnBoundary;

    if (!table || boundary === null) {
      return;
    }

    this.runAtTable(table, (tablePos) =>
      axis === "row"
        ? insertTableRowAt(this.view, tablePos, boundary)
        : insertTableColumnAt(this.view, tablePos, boundary),
    );
  };

  private readonly handleGripMouseDown = (event: MouseEvent) => {
    const hovered = this.hovered;

    if (event.button !== 0 || !hovered) {
      return;
    }

    event.preventDefault();
    const tablePos = getTablePos(this.view, hovered.table);

    if (tablePos === null) {
      return;
    }

    const axis: TableAxis = event.currentTarget === this.rowGrip ? "row" : "column";
    const index = axis === "row" ? hovered.row : hovered.col;
    // The header row never moves, so a row range reaching it is not one a grip carries.
    const first = axis === "row" ? 1 : 0;
    const selected = getSelectedTableAxis(this.view.state, tablePos, axis);
    let anchor = index;
    let range: TableAxisRange = { from: index, to: index + 1 };
    let collapseTo: number | null = null;

    if (event.shiftKey && selected && selected.anchor >= first) {
      anchor = selected.anchor;
      range = { from: Math.min(anchor, index), to: Math.max(anchor, index) + 1 };
    } else if (
      selected &&
      selected.from >= first &&
      selected.from <= index &&
      index < selected.to
    ) {
      range = selected;
      collapseTo = index;
    }

    if (collapseTo === null) {
      const tr = this.view.state.tr;
      const table = this.view.state.doc.nodeAt(tablePos);

      if (!table) {
        return;
      }

      setTableAxisSelection(tr, tablePos + 1, table, axis, anchor, index);
      this.view.dispatch(tr);
    }

    this.view.focus();
    this.press = {
      axis,
      table: hovered.table,
      range,
      collapseTo,
      x: event.clientX,
      y: event.clientY,
    };
  };

  private readonly handleGripMouseUp = (event: MouseEvent) => {
    const press = this.press;

    if (event.button !== 0 || !press || this.dragging || press.collapseTo === null) {
      return;
    }

    const tablePos = getTablePos(this.view, press.table);
    const table = tablePos === null ? null : this.view.state.doc.nodeAt(tablePos);

    if (tablePos === null || !table) {
      return;
    }

    const tr = this.view.state.tr;
    setTableAxisSelection(tr, tablePos + 1, table, press.axis, press.collapseTo, press.collapseTo);
    this.view.dispatch(tr);
  };

  private handleDragMove(event: MouseEvent) {
    const press = this.press;

    if (!press || (event.buttons & 1) === 0) {
      return;
    }

    if (
      !this.dragging &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) >= TABLE_DRAG_THRESHOLD
    ) {
      this.dragging = true;
      this.view.dom.setAttribute(TABLE_DRAGGING_ATTRIBUTE, "");
    }

    if (!this.dragging) {
      return;
    }

    this.measureSurface();
    const geometry = this.measure(press.table);
    const tablePos = getTablePos(this.view, press.table);
    const table = tablePos === null ? null : this.view.state.doc.nodeAt(tablePos);

    if (!geometry || !table) {
      this.dropBoundary = null;
    } else if (press.axis === "row") {
      const boundary = this.findRowBoundary(geometry, event.clientY);
      this.dropBoundary =
        boundary !== null && canMoveTableRowsTo(table, press.range, boundary) ? boundary : null;
    } else {
      const boundary = this.findColumnBoundary(geometry, event.clientX);
      this.dropBoundary =
        boundary !== null && canMoveTableColumnsTo(table, press.range, boundary) ? boundary : null;
    }

    this.render(null);
  }

  private readonly handleDocumentMouseUp = (event: MouseEvent) => {
    const press = this.press;

    if (!press || event.button !== 0) {
      return;
    }

    const boundary = this.dragging ? this.dropBoundary : null;
    this.endPress();

    if (boundary !== null) {
      this.runAtTable(press.table, (tablePos) =>
        press.axis === "row"
          ? moveTableRowsTo(this.view, tablePos, press.range, boundary)
          : moveTableColumnsTo(this.view, tablePos, press.range, boundary),
      );
    }

    this.scheduleRefresh();
  };

  private endPress() {
    this.press = null;
    this.dragging = false;
    this.dropBoundary = null;
    this.indicator.hidden = true;
    this.view.dom.removeAttribute(TABLE_DRAGGING_ATTRIBUTE);
  }
}

export const createLeafdownTableControlsPlugin = () =>
  $prose(
    () =>
      new Plugin({
        key: leafdownTableControlsPluginKey,
        view: (view) => new TableControlsView(view),
      }),
  );
