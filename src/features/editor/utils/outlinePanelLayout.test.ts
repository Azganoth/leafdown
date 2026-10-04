import { describe, expect, it } from "vitest";

import { getAnchoredOutlinePanelLayout, getOutlinePanelLayout } from "./outlinePanelLayout";

// A row's center sits 9 + 34 + index * 30 + 14 below the panel's top.
describe("outline panel layout", () => {
  it("moves the panel so the pointed row opens level with the pointer", () => {
    expect(getOutlinePanelLayout(2, 5, 300, 800)).toEqual({ top: 183, scrollTop: 0 });
  });

  it("scrolls a long list when the panel cannot move far enough", () => {
    expect(getOutlinePanelLayout(40, 60, 300, 600)).toEqual({ top: 12, scrollTop: 969 });
  });

  it("keeps the panel's top unless the list must move up to stay on the surface", () => {
    expect(getAnchoredOutlinePanelLayout(200, 0, 1, 600)).toEqual({ top: 200, scrollTop: 0 });
    expect(getAnchoredOutlinePanelLayout(500, 3, 4, 600)).toEqual({ top: 418, scrollTop: 0 });
    expect(getAnchoredOutlinePanelLayout(300, 40, 60, 600)).toEqual({ top: 12, scrollTop: 969 });
  });

  it("keeps the panel inside the surface at the ends of a short list", () => {
    expect(getOutlinePanelLayout(0, 5, 10, 800)).toEqual({ top: 12, scrollTop: 0 });
    expect(getOutlinePanelLayout(4, 5, 790, 800)).toEqual({ top: 588, scrollTop: 0 });
  });
});
