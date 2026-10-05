// @vitest-environment happy-dom

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

import { readDocumentSearchMatches } from "../commands/editing/search";
import {
  createMarkdownSearchTextParser,
  type MarkdownSearchTextParser,
} from "../utils/markdownSearchText";
import {
  findSearchableTextMatches,
  SEARCHABLE_TEXT_SEPARATOR,
  type TextSearchQuery,
} from "../utils/textSearch";

const mountEditor = setupMilkdownEditorMount();
const CORPUS_ROOT = join(process.cwd(), "corpus");

const collectMarkdownFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectMarkdownFiles(path);
    }

    return /\.(md|markdown)$/iu.test(entry.name) ? [path] : [];
  });

const CORPUS_FILES = collectMarkdownFiles(CORPUS_ROOT).map((path) => relative(CORPUS_ROOT, path));

let parser: MarkdownSearchTextParser;

beforeAll(async () => {
  parser = await createMarkdownSearchTextParser();
});

afterAll(() => parser.dispose());

const NO_QUERY: TextSearchQuery = { caseSensitive: false, text: "", wholeWord: false };

const readOpenedText = async (markdown: string) => {
  const mounted = await mountEditor(markdown);

  return readDocumentSearchMatches(mounted.view, NO_QUERY, { finalizeProjection: true }).text;
};

const matchTexts = (text: string, query: TextSearchQuery) =>
  findSearchableTextMatches(text, query).map(({ start, end }) => text.slice(start, end));

describe("folder search reads a file as the editor does", () => {
  it.each(CORPUS_FILES)("reads the same text from %s as the opened editor", async (path) => {
    const markdown = readFileSync(join(CORPUS_ROOT, path), "utf8");
    const parsed = parser.read(markdown);

    expect(parsed).toBe(await readOpenedText(markdown));
  });

  it("never holds the run separator inside a run", () => {
    const markdown = readFileSync(join(CORPUS_ROOT, "boundaries/bytes/nul-control.md"), "utf8");

    expect(markdown).toContain("\u0000");
    expect(parser.read(markdown).split(SEARCHABLE_TEXT_SEPARATOR).join("")).not.toContain("\u0000");
  });

  const query = (text: string, options: Partial<Omit<TextSearchQuery, "text">> = {}) => ({
    caseSensitive: false,
    wholeWord: false,
    ...options,
    text,
  });

  it.each([
    {
      name: "case folding in any script",
      markdown: "École, ÉCOLE, and école.",
      query: query("école"),
      expected: ["École", "ÉCOLE", "école"],
    },
    {
      name: "match case",
      markdown: "Leaf, leaf and LEAF.",
      query: query("leaf", { caseSensitive: true }),
      expected: ["leaf"],
    },
    {
      name: "whole words with combining marks and underscores",
      markdown: "leaf leaflet leaf_x naïve naïveté café cafe",
      query: query("cafe", { wholeWord: true }),
      expected: ["cafe"],
    },
    {
      name: "formatted text inside one run",
      markdown: "a le**af** `leaf` [le*af*](d.md) b",
      query: query("leaf"),
      expected: ["leaf", "leaf", "leaf"],
    },
    {
      name: "atomic and block boundaries",
      markdown:
        "foo\n\nbar\n\nleaf  \nlet\n\nalpha![x](i.png)beta\n\ngamma[^1]delta\n\nraw<b>x</b>html $x$ math\n\n[^1]: Note.",
      query: query("alphabeta"),
      expected: [],
    },
    {
      name: "literal queries",
      markdown: String.raw`a.b axb (c) a+b $1 \*star\*`,
      query: query("*star*"),
      expected: ["*star*"],
    },
    {
      name: "hidden destinations, titles, and image descriptions",
      markdown: '[label](https://example.com/secret "Title") ![described](i.png)',
      query: query("secret"),
      expected: [],
    },
    {
      name: "code text but not its language",
      markdown: "```leafy\nconst leafy = 1;\n```",
      query: query("leafy"),
      expected: ["leafy"],
    },
    {
      name: "frontmatter bodies",
      markdown: "---\ntitle: leaf\n---\n\nbody",
      query: query("leaf"),
      expected: ["leaf"],
    },
  ])("matches $name alike", async ({ expected, markdown, query: search }) => {
    expect(matchTexts(parser.read(markdown), search)).toEqual(expected);
    expect(matchTexts(await readOpenedText(markdown), search)).toEqual(expected);
  });
});
