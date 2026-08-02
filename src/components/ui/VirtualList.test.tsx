import { describe, expect, it } from "vitest";

import { withPinnedIndex } from "./VirtualList";

describe("withPinnedIndex", () => {
  it("leaves the rendered range alone when nothing is pinned", () => {
    const indexes = [4, 5, 6];

    expect(withPinnedIndex(indexes, undefined)).toBe(indexes);
  });

  it("leaves the rendered range alone when the pinned row is already in it", () => {
    const indexes = [4, 5, 6];

    expect(withPinnedIndex(indexes, 5)).toBe(indexes);
  });

  it("adds a pinned row outside the range in index order", () => {
    expect(withPinnedIndex([4, 5, 6], 300)).toEqual([4, 5, 6, 300]);
    expect(withPinnedIndex([4, 5, 6], 0)).toEqual([0, 4, 5, 6]);
    expect(withPinnedIndex([9, 10, 11], 2)).toEqual([2, 9, 10, 11]);
  });
});
