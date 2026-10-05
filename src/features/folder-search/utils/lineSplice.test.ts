import { describe, expect, it } from "vitest";

import { diffLines, spliceReplacedLines } from "./lineSplice";

const applyHunks = (a: string[], b: string[]) => {
  const hunks = diffLines(a, b);

  expect(hunks).not.toBeNull();

  const result: string[] = [];
  let copied = 0;

  for (const hunk of hunks!) {
    result.push(...a.slice(copied, hunk.aStart), ...b.slice(hunk.bStart, hunk.bEnd));
    copied = hunk.aEnd;
  }

  return [...result, ...a.slice(copied)];
};

describe("diffLines", () => {
  it.each([
    [[], []],
    [["a"], []],
    [[], ["a"]],
    [
      ["a", "b", "c"],
      ["a", "x", "c"],
    ],
    [
      ["a", "b", "c", "a", "b", "b", "a"],
      ["c", "b", "a", "b", "a", "c"],
    ],
    [
      ["same", "same", "same"],
      ["same", "other", "same", "same", "new"],
    ],
  ])("turns %j into %j", (a, b) => {
    expect(applyHunks(a, b)).toEqual(b);
  });

  it("finds the shortest script, keeping lines both texts share", () => {
    expect(diffLines(["a", "b", "c", "d"], ["a", "c", "d", "e"])).toEqual([
      { aStart: 1, aEnd: 2, bStart: 1, bEnd: 1 },
      { aStart: 4, aEnd: 4, bStart: 3, bEnd: 4 },
    ]);
  });

  it("gives up past the edit budget", () => {
    expect(diffLines(["a", "b", "c"], ["x", "y", "z"], 4)).toBeNull();
    expect(diffLines(["a", "b", "c"], ["x", "y", "z"], 6)).not.toBeNull();
  });
});

describe("spliceReplacedLines", () => {
  it("changes only the replaced lines, keeping lines the save would rewrite as authored", () => {
    const original = "| a | b |\n| --- | --- |\n| x | yy |\n\nThe colour is green.\n";
    const baseline = "| a | b  |\n| - | -- |\n| x | yy |\n\nThe colour is green.\n";
    const replaced = "| a | b  |\n| - | -- |\n| x | yy |\n\nThe color is green.\n";

    expect(spliceReplacedLines(original, baseline, replaced)).toBe(
      "| a | b |\n| --- | --- |\n| x | yy |\n\nThe color is green.\n",
    );
  });

  it("keeps the file's line endings outside the replaced lines and how it ends", () => {
    const original = "*a*\r\nThe colour\r\nend colour";
    const baseline = "_a_\r\nThe colour\r\nend colour\r\n";
    const replaced = "_a_\r\nThe color\r\nend color\r\n";

    expect(spliceReplacedLines(original, baseline, replaced)).toBe("*a*\r\nThe color\r\nend color");
  });

  it("places lines a replacement adds and drops lines it removes", () => {
    expect(spliceReplacedLines("x \nkeep\n", "x\nkeep\n", "x\nkeep\nadded\n")).toBe(
      "x \nkeep\nadded\n",
    );
    expect(spliceReplacedLines("x \ngone\nkeep\n", "x\ngone\nkeep\n", "x\nkeep\n")).toBe(
      "x \nkeep\n",
    );
  });

  it("refuses a replaced line the save also rewrote", () => {
    expect(
      spliceReplacedLines(
        "| colour | b |\n| --- | --- |\n",
        "| colour | b |\n| ------ | - |\n",
        "| color | b |\n| ----- | - |\n",
      ),
    ).toBeNull();
  });

  it("returns the replaced text when the file reads as its baseline", () => {
    expect(spliceReplacedLines("The colour\n", "The colour\n", "The color\n")).toBe("The color\n");
    expect(spliceReplacedLines("", "", "")).toBe("");
  });
});
