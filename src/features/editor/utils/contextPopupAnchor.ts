import type { EditorView } from "@milkdown/kit/prose/view";

// Roughly the popup's height. It only gates whether there is room beside the selection, so
// measuring the real thing would buy nothing.
const POPUP_CLEARANCE = 200;

// Floating UI's own overflow test, so the popup is clamped to the element it listens on.
const OVERFLOW_PATTERN = /auto|scroll|overlay|hidden|clip/u;

export interface ContextPopupAnchor {
  contextElement: Element;
  getRect: () => DOMRect;
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

/** Resolves the rect the popup positions against, beside the visible part of the selection. */
export const resolveContextPopupAnchorRect = (selection: DOMRect, viewport: DOMRect): DOMRect => {
  const top = clamp(selection.top, viewport.top, viewport.bottom);
  const left = clamp(selection.left, viewport.left, viewport.right);
  const bottom = clamp(selection.bottom, top, viewport.bottom);
  const right = clamp(selection.right, left, viewport.right);

  // Collision handling cannot rescue a selection that fills the visible area: both sides
  // overflow, and Radix shifts along the alignment axis only.
  if (viewport.bottom - bottom < POPUP_CLEARANCE && top - viewport.top < POPUP_CLEARANCE) {
    return createRect(left, top, right, top);
  }

  return createRect(left, top, right, bottom);
};

export const createContextPopupAnchor = (view: EditorView): ContextPopupAnchor => {
  const scrollViewport = findScrollViewport(view.dom);
  const getViewportRect = () =>
    scrollViewport
      ? scrollViewport.getBoundingClientRect()
      : createRect(0, 0, window.innerWidth, window.innerHeight);

  return {
    contextElement: view.dom,
    getRect: () => {
      const selection = view.isDestroyed ? null : getSelectionRect(view);

      return selection
        ? resolveContextPopupAnchorRect(selection, getViewportRect())
        : createRect(0, 0, 0, 0);
    },
  };
};
