import type { EditorView } from "@milkdown/kit/prose/view";

// Roughly the popup's height. It only gates whether there is room beside the selection, so
// measuring the real thing would buy nothing.
const POPUP_CLEARANCE = 200;

// Floating UI reads a rect of no height resting on the clipping edge as fully clipped, which
// would hide a popup meant to be visible.
const MINIMUM_ANCHOR_HEIGHT = 1;

// Floating UI's own overflow test, so the popup is clamped to the element it listens on.
const OVERFLOW_PATTERN = /auto|scroll|overlay|hidden|clip/u;

/**
 * `live` leaves the viewport with the selection, so the popup hides once none of it is visible.
 * `pinned` never leaves it, so a popup the user is working in stays visible and still.
 */
export type ContextPopupAnchorMode = "live" | "pinned";

export interface ContextPopupAnchor {
  contextElement: Element;
  getRect: (mode: ContextPopupAnchorMode) => DOMRect;
}

const createRect = (left: number, top: number, right: number, bottom: number): DOMRect => {
  const rect = {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
    x: left,
    y: top,
  };

  return { ...rect, toJSON: () => rect };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getSelectionRect = (view: EditorView): DOMRect | null => {
  const { selection } = view.state;

  try {
    const from = view.coordsAtPos(selection.from, 1);
    const to = selection.empty ? from : view.coordsAtPos(selection.to, -1);

    return createRect(
      Math.min(from.left, to.left),
      Math.min(from.top, to.top),
      Math.max(from.right, to.right),
      Math.max(from.bottom, to.bottom),
    );
  } catch {
    return null;
  }
};

const findScrollViewport = (element: Element) => {
  for (let current = element.parentElement; current; current = current.parentElement) {
    const { display, overflow, overflowX, overflowY } = getComputedStyle(current);

    if (
      OVERFLOW_PATTERN.test(overflow + overflowY + overflowX) &&
      display !== "inline" &&
      display !== "contents"
    ) {
      return current;
    }
  }

  return null;
};

export const canMeasureSelection = (view: EditorView) => getSelectionRect(view) !== null;

const isOutsideViewport = (selection: DOMRect, viewport: DOMRect) =>
  selection.bottom < viewport.top ||
  selection.top > viewport.bottom ||
  selection.right < viewport.left ||
  selection.left > viewport.right;

const hasRoomBeside = (top: number, bottom: number, viewport: DOMRect) =>
  viewport.bottom - bottom >= POPUP_CLEARANCE || top - viewport.top >= POPUP_CLEARANCE;

const withMinimumHeight = (
  left: number,
  top: number,
  right: number,
  bottom: number,
  viewport: DOMRect,
): DOMRect => {
  const anchorTop = Math.min(top, viewport.bottom - MINIMUM_ANCHOR_HEIGHT);

  return createRect(left, anchorTop, right, Math.max(bottom, anchorTop + MINIMUM_ANCHOR_HEIGHT));
};

/** Resolves the rect the popup positions against: beside the visible selection, or inside it. */
export const resolveContextPopupAnchorRect = (
  selection: DOMRect,
  viewport: DOMRect,
  mode: ContextPopupAnchorMode,
): DOMRect => {
  // Floating UI calls a reference hidden only once it is fully clipped, which a clamped rect
  // never is, so an invisible selection has to be reported where it actually is.
  if (mode === "live" && isOutsideViewport(selection, viewport)) {
    return selection;
  }

  const top = clamp(selection.top, viewport.top, viewport.bottom);
  const left = clamp(selection.left, viewport.left, viewport.right);
  const bottom = clamp(selection.bottom, top, viewport.bottom);
  const right = clamp(selection.right, left, viewport.right);

  // A selection taller than the visible area has no outside within reach, and one that fills the
  // area leaves no room either side. Both anchor to its first visible line, which puts the popup
  // inside the selection; collision handling would only push it further out.
  if (selection.height > viewport.height || !hasRoomBeside(top, bottom, viewport)) {
    return withMinimumHeight(left, top, right, top, viewport);
  }

  return withMinimumHeight(left, top, right, bottom, viewport);
};

export const createContextPopupAnchor = (view: EditorView): ContextPopupAnchor => {
  const scrollViewport = findScrollViewport(view.dom);
  const getViewportRect = () =>
    scrollViewport
      ? scrollViewport.getBoundingClientRect()
      : createRect(0, 0, window.innerWidth, window.innerHeight);

  return {
    contextElement: view.dom,
    getRect: (mode) => {
      const selection = view.isDestroyed ? null : getSelectionRect(view);

      return selection
        ? resolveContextPopupAnchorRect(selection, getViewportRect(), mode)
        : createRect(0, 0, 0, 0);
    },
  };
};
