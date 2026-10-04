// These match the `--outline-*` lengths and the panel's padding in `heading-outline.css`.
const ROW_HEIGHT = 28;
const ROW_GAP = 2;
const HEADER_HEIGHT = 34;
const PANEL_INSET = 9;
const EDGE_MARGIN = 12;

export interface OutlinePanelLayout {
  top: number;
  scrollTop: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const measure = (index: number, count: number, height: number) => {
  const contentHeight =
    2 * PANEL_INSET + HEADER_HEIGHT + count * ROW_HEIGHT + Math.max(0, count - 1) * ROW_GAP;
  return {
    contentHeight,
    panelHeight: Math.min(contentHeight, height - 2 * EDGE_MARGIN),
    rowCenter: PANEL_INSET + HEADER_HEIGHT + index * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2,
  };
};

// Keeps the open panel's top where it is, moving it only as far as it must to stay on the
// surface, and scrolls the row at `index` to the middle of a list too long to fit.
export const getAnchoredOutlinePanelLayout = (
  top: number,
  index: number,
  count: number,
  height: number,
): OutlinePanelLayout => {
  const { contentHeight, panelHeight, rowCenter } = measure(index, count, height);
  return {
    top: clamp(top, EDGE_MARGIN, Math.max(EDGE_MARGIN, height - EDGE_MARGIN - panelHeight)),
    scrollTop: clamp(rowCenter - panelHeight / 2, 0, Math.max(0, contentHeight - panelHeight)),
  };
};

// Places the open panel and its scroll so the row at `index` sits level with the pointer, as far
// as the panel can move inside a surface of the given height.
export const getOutlinePanelLayout = (
  index: number,
  count: number,
  pointerY: number,
  height: number,
): OutlinePanelLayout => {
  const { contentHeight, panelHeight, rowCenter } = measure(index, count, height);
  const unclampedTop = pointerY - rowCenter;
  const top = clamp(
    unclampedTop,
    EDGE_MARGIN,
    Math.max(EDGE_MARGIN, height - EDGE_MARGIN - panelHeight),
  );
  return {
    top,
    scrollTop: clamp(top - unclampedTop, 0, Math.max(0, contentHeight - panelHeight)),
  };
};
