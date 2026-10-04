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

// Places the open panel and its scroll so the row at `index` sits level with the pointer, as far
// as the panel can move inside a surface of the given height.
export const getOutlinePanelLayout = (
  index: number,
  count: number,
  pointerY: number,
  height: number,
): OutlinePanelLayout => {
  const contentHeight =
    2 * PANEL_INSET + HEADER_HEIGHT + count * ROW_HEIGHT + Math.max(0, count - 1) * ROW_GAP;
  const panelHeight = Math.min(contentHeight, height - 2 * EDGE_MARGIN);
  const unclampedTop =
    pointerY - (PANEL_INSET + HEADER_HEIGHT + index * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2);
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
