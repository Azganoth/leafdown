// @vitest-environment happy-dom

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

import { changeSearchQuery, openSearch, replaceAllSearchMatches } from "../commands/editing/search";
import {
  createMarkdownSearchTextParser,
  type MarkdownSearchTextParser,
} from "../utils/markdownSearchText";
import type { TextSearchQuery } from "../utils/textSearch";

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

const query = (text: string): TextSearchQuery => ({ caseSensitive: false, text, wholeWord: true });

const replaceInOpenedEditor = async (markdown: string, search: TextSearchQuery, text: string) => {
  const mounted = await mountEditor(markdown);

  openSearch(mounted.view, "replace");
  changeSearchQuery(mounted.view, { query: search.text, wholeWord: search.wholeWord });
  replaceAllSearchMatches(mounted.view, text);

  return mounted.getMarkdown();
};

describe("folder replacement plans a file as the opened editor replaces it", () => {
  it.each(CORPUS_FILES)("replaces matches in %s as Replace all and Save do", async (path) => {
    const markdown = readFileSync(join(CORPUS_ROOT, path), "utf8");

    for (const search of [query("the"), query("a")]) {
      const plan = parser.planReplacement(markdown, search, "R*[x]");
      const [baseline, replaced] =
        plan.matches.length === 0
          ? ["", ""]
          : [
              (await mountEditor(markdown)).getMarkdown(),
              await replaceInOpenedEditor(markdown, search, "R*[x]"),
            ];

      expect(plan.baseline).toBe(baseline);
      expect(plan.replaced).toBe(replaced);
    }
  });

  it("refuses a replacement the document would not take as shown", () => {
    const markdown = "Text.[^one][^two]\n\n[^one]: First.\n\n[^two]: Second.\n";
    const plan = parser.planReplacement(markdown, query("two"), "one");

    expect(plan.matches).toHaveLength(1);
    expect(plan.replaced).toBeNull();
  });

  it("reads emptied runs as gone, as the document does", () => {
    const plan = parser.planReplacement("a ![i](i.png)leaf\n", query("leaf"), "");

    expect(plan.replaced).toBe("a ![i](i.png)\n");
  });
});
