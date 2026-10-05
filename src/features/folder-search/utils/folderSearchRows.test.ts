import { describe, expect, it } from "vitest";

import { getMatchSnippet } from "./folderSearchRows";

const context = (before: string, after: string, clippedBefore = false, clippedAfter = false) => ({
  before,
  match: "leaf",
  after,
  clippedBefore,
  clippedAfter,
});

describe("match snippets", () => {
  it("keeps to the match's line within a run of several lines", () => {
    expect(
      getMatchSnippet(context("const a = 1;\nconst ", " = 2;\nconst b = 3;", true, true)),
    ).toEqual({
      before: "const ",
      match: "leaf",
      after: " = 2;",
      clippedBefore: false,
      clippedAfter: false,
    });
  });

  it("marks a line cut short at either end", () => {
    expect(
      getMatchSnippet(context("start of a long line before the ", " after", true, true)),
    ).toEqual({
      before: " a long line before the ",
      match: "leaf",
      after: " after",
      clippedBefore: true,
      clippedAfter: true,
    });
  });

  it("never splits a character outside the basic plane when it shortens the lead", () => {
    const before = `${"🌿".repeat(30)} `;

    expect(getMatchSnippet(context(before, "")).before).toBe(`${"🌿".repeat(23)} `);
  });
});
