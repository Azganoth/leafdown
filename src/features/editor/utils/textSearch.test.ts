// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorTextPosition, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";

import {
  findMatchIndexBefore,
  findMatchIndexFrom,
  findTextMatches,
  type TextSearchQuery,
} from "./textSearch";

const mountEditor = setupMilkdownEditorMount();

// The caret rests in a trailing plain paragraph, so no object opens its source under the search.
const mountDocument = async (markdown: string) => {
  const mounted = await mountEditor(`${markdown}\n\nZ\n`);

  setSelectionAtDocumentEnd(mounted.view);

  return mounted;
};

const findTexts = (
  mounted: MountedMilkdownEditor,
  text: string,
  options: Partial<Omit<TextSearchQuery, "text">> = {},
) => {
  const { doc } = mounted.view.state;

  return findTextMatches(doc, { caseSensitive: false, wholeWord: false, ...options, text }).map(
    ({ from, to }) => doc.textBetween(from, to),
  );
};

describe("findTextMatches", () => {
  it("matches without case by default and exactly with match case", async () => {
    const mounted = await mountDocument("Leaf, leaf and LEAF.");

    expect(findTexts(mounted, "leaf")).toEqual(["Leaf", "leaf", "LEAF"]);
    expect(findTexts(mounted, "leaf", { caseSensitive: true })).toEqual(["leaf"]);
  });

  it("folds case outside ASCII", async () => {
    const mounted = await mountDocument("École, ÉCOLE, and école.");

    expect(findTexts(mounted, "école")).toEqual(["École", "ÉCOLE", "école"]);
    expect(findTexts(mounted, "école", { caseSensitive: true })).toEqual(["école"]);
  });

  it("limits whole-word matches to whole words in any script", async () => {
    const mounted = await mountDocument(
      "leaf leaflet underleaf leaf_x leaf. naïve naïveté café cafe",
    );

    expect(findTexts(mounted, "leaf", { wholeWord: true })).toEqual(["leaf", "leaf"]);
    expect(findTexts(mounted, "naïve", { wholeWord: true })).toEqual(["naïve"]);
    expect(findTexts(mounted, "cafe", { wholeWord: true })).toEqual(["cafe"]);
    expect(findTexts(mounted, "leaf")).toHaveLength(5);
  });

  it("reports exact positions around characters outside the basic plane", async () => {
    const mounted = await mountDocument("🌿 leaf 🌿 Leaf 🌿");

    expect(findTexts(mounted, "leaf")).toEqual(["leaf", "Leaf"]);
    expect(findTexts(mounted, "🌿")).toEqual(["🌿", "🌿", "🌿"]);
  });

  it("finds repeated matches without overlapping them", async () => {
    const mounted = await mountDocument("aaaa abab");

    expect(findTexts(mounted, "aa")).toEqual(["aa", "aa"]);
    expect(findTexts(mounted, "ab")).toEqual(["ab", "ab"]);
  });

  it("reads the query as literal text", async () => {
    const mounted = await mountDocument("a.b axb (c) a+b $1");

    expect(findTexts(mounted, ".")).toEqual(["."]);
    expect(findTexts(mounted, "(c)")).toEqual(["(c)"]);
    expect(findTexts(mounted, "a+b")).toEqual(["a+b"]);
    expect(findTexts(mounted, "$1")).toEqual(["$1"]);
  });

  it("matches text across the formatting inside one run", async () => {
    const mounted = await mountDocument("a le**af** `leaf` b");

    expect(findTexts(mounted, "leaf")).toEqual(["leaf", "leaf"]);
  });

  it("never matches across blocks, hard breaks, or inline objects", async () => {
    const mounted = await mountDocument(
      "foo\n\nbar\n\nleaf  \nlet\n\nalpha![x](i.png)beta\n\ngamma[^1]delta\n\n[^1]: Note.",
    );

    expect(findTexts(mounted, "foobar")).toEqual([]);
    expect(findTexts(mounted, "leaflet")).toEqual([]);
    expect(findTexts(mounted, "alphabeta")).toEqual([]);
    expect(findTexts(mounted, "gammadelta")).toEqual([]);
    expect(findTexts(mounted, "leaf")).toEqual(["leaf"]);
  });

  it("does not match Markdown syntax or hidden destinations and titles", async () => {
    const mounted = await mountDocument(
      'Plain **bold** and [label](https://example.com/secret "Title").',
    );

    expect(findTexts(mounted, "**")).toEqual([]);
    expect(findTexts(mounted, "example")).toEqual([]);
    expect(findTexts(mounted, "Title")).toEqual([]);
    expect(findTexts(mounted, "label")).toEqual(["label"]);
    expect(findTexts(mounted, "bold")).toEqual(["bold"]);
  });

  it("matches code block text but not its language", async () => {
    const mounted = await mountDocument("```leafy\nconst leafy = 1;\n```");

    expect(findTexts(mounted, "leafy")).toEqual(["leafy"]);
  });

  it("finds nothing for an empty query and leaves out an excluded range", async () => {
    const mounted = await mountDocument("leaf one, leaf two");
    const { doc } = mounted.view.state;
    const query = { caseSensitive: false, text: "leaf", wholeWord: false };
    const second = getEditorTextPosition(mounted, "leaf two");

    expect(findTextMatches(doc, { ...query, text: "" })).toEqual([]);
    expect(findTextMatches(doc, query, { from: second, to: second + 4 })).toHaveLength(1);
  });
});

describe("adjacent match lookup", () => {
  const matches = [
    { from: 1, to: 3 },
    { from: 5, to: 7 },
    { from: 9, to: 11 },
  ];

  it("finds the next match from a position and wraps to the first", () => {
    expect(findMatchIndexFrom(matches, 4)).toBe(1);
    expect(findMatchIndexFrom(matches, 5)).toBe(1);
    expect(findMatchIndexFrom(matches, 12)).toBe(0);
    expect(findMatchIndexFrom([], 1)).toBeNull();
  });

  it("finds the previous match before a position and wraps to the last", () => {
    expect(findMatchIndexBefore(matches, 5)).toBe(0);
    expect(findMatchIndexBefore(matches, 9)).toBe(1);
    expect(findMatchIndexBefore(matches, 1)).toBe(2);
    expect(findMatchIndexBefore([], 1)).toBeNull();
  });
});
