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

const resolve = (selection: DOMRect) => resolveContextPopupAnchorRect(selection, VIEWPORT, "live");

const resolvePinned = (selection: DOMRect) =>
  resolveContextPopupAnchorRect(selection, VIEWPORT, "pinned");

describe("resolveContextPopupAnchorRect", () => {
  it("anchors to a fully visible selection unchanged", () => {
    expect(resolve(createRect(120, 400, 260, 420))).toMatchObject({
      left: 120,
      top: 400,
      right: 260,
      bottom: 420,
    });
  });

  it("trims the part of a selection that runs above the viewport", () => {
    expect(resolve(createRect(120, 40, 260, 500))).toMatchObject({ top: 100, bottom: 500 });
  });

  it("clamps a selection wider than the viewport to its horizontal bounds", () => {
    expect(resolve(createRect(-50, 400, 900, 420))).toMatchObject({ left: 0, right: 800 });
  });

  it("anchors above a selection that leaves room only there", () => {
    // Runs off the bottom, but starts far enough down that the popup still fits above it.
    expect(resolve(createRect(120, 700, 260, 1300))).toMatchObject({ top: 700, bottom: 1100 });
  });

  describe("a selection the popup cannot sit beside", () => {
    it.each([
      ["spans the whole viewport", createRect(120, -3000, 260, 6000), 100],
      ["starts above it and ends inside it", createRect(120, -3000, 260, 500), 100],
      ["starts inside it and runs past the bottom", createRect(120, 300, 260, 4000), 300],
    ])("anchors inside the visible selection when it %s", (_case, selection, expectedTop) => {
      expect(resolve(selection)).toMatchObject({ top: expectedTop, bottom: expectedTop + 1 });
    });

    it("anchors inside a fully visible selection that fills the viewport", () => {
      expect(resolve(createRect(120, 150, 260, 1000))).toMatchObject({ top: 150, bottom: 151 });
    });
  });

  describe("a selection with no visible part", () => {
    it.each([
      ["above", createRect(120, -400, 260, -300)],
      ["below", createRect(120, 3000, 260, 3100)],
    ])("reports a live anchor beyond the viewport when the selection is %s it", (_where, off) => {
      expect(resolve(off)).toBe(off);
    });

    it("keeps a pinned anchor measurable at the viewport's top edge", () => {
      expect(resolvePinned(createRect(120, -400, 260, -300))).toMatchObject({
        top: 100,
        bottom: 101,
      });
    });

    it("keeps a pinned anchor measurable at the viewport's bottom edge", () => {
      expect(resolvePinned(createRect(120, 3000, 260, 3100))).toMatchObject({
        top: 1099,
        bottom: 1100,
      });
    });
  });

  it("clamps a pinned anchor for a selection that is still partly visible", () => {
    expect(resolvePinned(createRect(120, 600, 260, 1300))).toMatchObject({
      top: 600,
      bottom: 1100,
    });
  });
});
