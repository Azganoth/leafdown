import { describe, expect, it } from "vitest";

import {
  getImageSourcePresentationSpans,
  getLinkSourceSuffixSpans,
} from "./sourceProjectionLinkPresentation";

const runs = (source: string, spans: ReturnType<typeof getLinkSourceSuffixSpans>) =>
  spans.reduce<string[][]>((result, { className, from, to }) => {
    const kind = className === "leafdown-source-projection__marker" ? "marker" : "content";
    const previous = result.at(-1);
    if (previous?.[0] === kind) {
      previous[1] += source.slice(from, to);
    } else {
      result.push([kind, source.slice(from, to)]);
    }
    return result;
  }, []);

describe("link and image source presentation", () => {
  it.each([
    [
      '[label](destination "title")',
      [
        ["marker", '](destination "'],
        ["content", "title"],
        ["marker", '")'],
      ],
    ],
    [
      "[label](<two words> 'title')",
      [
        ["marker", "](<two words> '"],
        ["content", "title"],
        ["marker", "')"],
      ],
    ],
    [
      "[label](destination (title))",
      [
        ["marker", "](destination ("],
        ["content", "title"],
        ["marker", "))"],
      ],
    ],
    ["[label][reference]", [["marker", "][reference]"]]],
    [
      '[label]( "title")',
      [
        ["marker", ']( "'],
        ["content", "title"],
        ["marker", '")'],
      ],
    ],
  ])("separates authored values in %s", (source, expected) => {
    expect(
      runs(source, getLinkSourceSuffixSpans(source, source.indexOf("]"), source.length)),
    ).toEqual(expected);
  });

  it("separates an image description, destination, and title", () => {
    const source = '![an [alt] and \\] end](<two words> "title")';

    expect(runs(source, getImageSourcePresentationSpans(source))).toEqual([
      ["marker", "!["],
      ["content", "an [alt] and \\] end"],
      ["marker", '](<two words> "'],
      ["content", "title"],
      ["marker", '")'],
    ]);
  });

  it("leaves source that no longer spells an image as plain editable text", () => {
    expect(getImageSourcePresentationSpans("plain text")).toEqual([]);
  });
});
