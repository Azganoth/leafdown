import { describe, expect, it } from "vitest";

import { withPinnedIndexes } from "./virtual-list";

describe("withPinnedIndexes", () => {
  it("leaves the rendered range alone when nothing is pinned", () => {
    const indexes = [4, 5, 6];

    expect(withPinnedIndexes(indexes, [])).toBe(indexes);
  });

  it("leaves the rendered range alone when every pinned row is already in it", () => {
    const indexes = [4, 5, 6];

    expect(withPinnedIndexes(indexes, [5, 6])).toBe(indexes);
  });

  it("adds pinned rows outside the range in index order", () => {
    expect(withPinnedIndexes([4, 5, 6], [300])).toEqual([4, 5, 6, 300]);
    expect(withPinnedIndexes([4, 5, 6], [0])).toEqual([0, 4, 5, 6]);
    expect(withPinnedIndexes([9, 10, 11], [2, 40])).toEqual([2, 9, 10, 11, 40]);
  });

  it("adds a row pinned twice only once", () => {
    expect(withPinnedIndexes([4, 5, 6], [40, 40])).toEqual([4, 5, 6, 40]);
  });
});
