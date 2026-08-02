import { describe, expect, it } from "vitest";

import { resolveContextPopupAnchorRect } from "./contextPopupAnchor";

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

// Tall enough that both ends of a selection can clear the popup.
const VIEWPORT = createRect(0, 100, 800, 1100);

const resolve = (selection: DOMRect) => resolveContextPopupAnchorRect(selection, VIEWPORT);

describe("resolveContextPopupAnchorRect", () => {
  it("anchors to a fully visible selection unchanged", () => {
    expect(resolve(createRect(120, 400, 260, 420))).toMatchObject({
      left: 120,
      top: 400,
      right: 260,
      bottom: 420,
    });
  });

  it("trims the part of the selection above the viewport", () => {
    expect(resolve(createRect(120, 40, 260, 500))).toMatchObject({ top: 100, bottom: 500 });
  });

  it("trims the part of the selection below the viewport", () => {
    expect(resolve(createRect(120, 600, 260, 4000))).toMatchObject({ top: 600, bottom: 1100 });
  });

  it("collapses to the visible top edge when the selection leaves no room on either side", () => {
    const anchor = resolve(createRect(120, -3000, 260, 6000));

    expect(anchor).toMatchObject({ top: 100, bottom: 100, height: 0 });
  });

  it("keeps a selection that clears the popup on one side only", () => {
    expect(resolve(createRect(120, 700, 260, 6000))).toMatchObject({ top: 700, bottom: 1100 });
  });

  it("collapses a selection ending too close to the viewport bottom to clear it", () => {
    const anchor = resolve(createRect(120, 150, 260, 1000));

    expect(anchor).toMatchObject({ top: 150, bottom: 150 });
  });

  it("pins a selection scrolled off the top to the viewport's top edge", () => {
    expect(resolve(createRect(120, -400, 260, -300))).toMatchObject({ top: 100, bottom: 100 });
  });

  it("pins a selection scrolled off the bottom to the viewport's bottom edge", () => {
    expect(resolve(createRect(120, 3000, 260, 3100))).toMatchObject({ top: 1100, bottom: 1100 });
  });

  it("clamps a selection wider than the viewport to its horizontal bounds", () => {
    expect(resolve(createRect(-50, 400, 900, 420))).toMatchObject({ left: 0, right: 800 });
  });
});
