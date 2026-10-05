// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorTextPosition, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";

import {
  findMatchIndexBefore,
  findMatchIndexFrom,
  findSearchableTextMatches,
  findSearchMatchTarget,
  findTextMatches,
  getSearchableText,
  getSearchMatchContext,
  SEARCH_MATCH_CONTEXT_RADIUS,
  SEARCHABLE_TEXT_SEPARATOR,
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

describe("searchable text", () => {
  const query = (text: string, options: Partial<Omit<TextSearchQuery, "text">> = {}) => ({
    caseSensitive: false,
    wholeWord: false,
    ...options,
    text,
  });

  it("joins each run of text and matches it as the document does", async () => {
    const mounted = await mountDocument("a le**af** b\n\nleaf  \nlet ![x](i.png) leaf");
    const searchable = getSearchableText(mounted.view.state.doc);
    const fromText = findSearchableTextMatches(searchable.text, query("leaf")).map(
      ({ start, end }) => searchable.text.slice(start, end),
    );

    expect(searchable.text.split(SEARCHABLE_TEXT_SEPARATOR)).toEqual([
      "a leaf b",
      "leaf",
      "let ",
      " leaf",
      "Z",
    ]);
    expect(fromText).toEqual(findTexts(mounted, "leaf"));
    expect(findSearchableTextMatches(searchable.text, query("leaflet"))).toEqual([]);
  });

  it("treats the ends of a run as word boundaries", () => {
    const text = ["leaf", "leafy", "leaf"].join(SEARCHABLE_TEXT_SEPARATOR);

    expect(findSearchableTextMatches(text, query("leaf", { wholeWord: true }))).toEqual([
      { start: 0, end: 4 },
      { start: 11, end: 15 },
    ]);
  });

  it("never matches a query holding the separator", () => {
    const text = ["a", "b"].join(SEARCHABLE_TEXT_SEPARATOR);

    expect(findSearchableTextMatches(text, query(`a${SEARCHABLE_TEXT_SEPARATOR}b`))).toEqual([]);
  });

  it("reads the body of frontmatter, as its source is editable", async () => {
    const mounted = await mountEditor("---\ntitle: leaf\n---\n\nbody\n");

    expect(findTexts(mounted, "leaf")).toEqual(["leaf"]);
  });
});

describe("match context", () => {
  const run = "The quick brown fox jumps over the lazy dog";
  const text = ["before", run, "after"].join(SEARCHABLE_TEXT_SEPARATOR);
  const start = text.indexOf("fox");

  it("stays within the match's run and says where it was clipped", () => {
    expect(getSearchMatchContext(text, { start, end: start + 3 }, 100)).toEqual({
      before: "The quick brown ",
      match: "fox",
      after: " jumps over the lazy dog",
      clippedBefore: false,
      clippedAfter: false,
    });
    expect(getSearchMatchContext(text, { start, end: start + 3 }, 6)).toEqual({
      before: "brown ",
      match: "fox",
      after: " jumps",
      clippedBefore: true,
      clippedAfter: true,
    });
  });

  it("never cuts a character outside the basic plane in half", () => {
    const emoji = "🌿🌿 leaf 🌿🌿";
    const at = emoji.indexOf("leaf");
    const context = getSearchMatchContext(emoji, { start: at, end: at + 4 }, 4);

    expect(context.before).toBe("🌿 ");
    expect(context.after).toBe(" 🌿");
  });
});

describe("match targets", () => {
  const text = ["one leaf", "two leaf", "three leaf"].join(SEARCHABLE_TEXT_SEPARATOR);
  const matches = findSearchableTextMatches(text, {
    caseSensitive: false,
    text: "leaf",
    wholeWord: false,
  });
  const targetAt = (index: number) => ({
    ordinal: index,
    context: getSearchMatchContext(text, matches[index], SEARCH_MATCH_CONTEXT_RADIUS),
  });

  it("finds a match at its place, or the nearest that still reads the same", () => {
    expect(findSearchMatchTarget(text, matches, targetAt(1))).toBe(1);
    expect(findSearchMatchTarget(text, matches.slice(1), targetAt(2))).toBe(1);
    expect(findSearchMatchTarget(text, matches, { ...targetAt(2), ordinal: 0 })).toBe(2);
  });

  it("names no match once the text it was found in is gone", () => {
    const edited = text.replace("two leaf", "two leaves");

    expect(
      findSearchMatchTarget(
        edited,
        findSearchableTextMatches(edited, { caseSensitive: false, text: "leaf", wholeWord: false }),
        targetAt(1),
      ),
    ).toBeNull();
  });
});
