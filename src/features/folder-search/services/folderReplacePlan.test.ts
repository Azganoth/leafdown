// @vitest-environment happy-dom

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatMarkdownForSave } from "@/features/document";
import {
  createMarkdownSearchTextParser,
  type MarkdownSearchTextParser,
  type TextSearchQuery,
} from "@/features/editor";

import { diffLines } from "../utils/lineSplice";
import { planFileReplacement, type FolderReplaceSaveOptions } from "./folderReplacePlan";

const CORPUS_ROOT = join(process.cwd(), "corpus");
const SAVE: FolderReplaceSaveOptions = { defaultLineEnding: "lf", insertFinalNewline: true };
const REPLACEMENT = "REPLACED";

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
const lineEndingOf = (text: string) =>
  text.includes("\r\n") ? "crlf" : text.includes("\n") ? "lf" : null;
const lines = (text: string) => text.split(/\r\n|\r|\n/u);

const plan = (markdown: string, search = query("the")) =>
  planFileReplacement(
    parser,
    markdown,
    lineEndingOf(markdown),
    parser.planReplacement(markdown, search, REPLACEMENT),
    SAVE,
  );

describe("planning a file's replacement", () => {
  it.each(CORPUS_FILES)("writes %s as a save would read it back", (path) => {
    const markdown = readFileSync(join(CORPUS_ROOT, path), "utf8");
    const outcome = plan(markdown);

    if (outcome.kind !== "planned") {
      return;
    }

    const saved = formatMarkdownForSave(
      parser.planReplacement(markdown, query("the"), REPLACEMENT).replaced!,
      lineEndingOf(markdown) ?? SAVE.defaultLineEnding,
      SAVE.insertFinalNewline,
    );

    expect(
      formatMarkdownForSave(
        parser.normalize(outcome.content),
        lineEndingOf(markdown) ?? SAVE.defaultLineEnding,
        SAVE.insertFinalNewline,
      ),
    ).toBe(saved);

    // Spliced files change only lines holding the replacement; a file written whole is marked.
    const changedLines = outcome.rewritesOtherText
      ? []
      : diffLines(lines(markdown), lines(outcome.content))!.flatMap(({ bEnd, bStart }) =>
          lines(outcome.content).slice(bStart, bEnd),
        );

    expect(changedLines.filter((line) => !line.includes(REPLACEMENT))).toEqual([]);
  });

  it("leaves a table the save would pad as the file has it", () => {
    const markdown = readFileSync(join(CORPUS_ROOT, "practical/technical-readme.md"), "utf8");
    const outcome = plan(markdown, query("preview"));

    expect(outcome).toMatchObject({ kind: "planned", rewritesOtherText: false });
    expect(outcome.kind === "planned" && outcome.content).toContain(
      "| Command | Purpose | Writes files |\n| --- | --- | :---: |",
    );
  });

  it("writes a file whole when a replaced line is one the save rewrites", () => {
    const outcome = plan("| leaf | b |\n| --- | --- |\n| x | y |\n", query("leaf"));

    expect(outcome).toEqual({
      kind: "planned",
      content: "| REPLACED | b |\n| -------- | - |\n| x        | y |\n",
      rewritesOtherText: true,
    });
  });

  it("refuses a file the replacement would not read as, and skips one it would not change", () => {
    expect(
      planFileReplacement(
        parser,
        "a\n",
        "lf",
        { text: "a", matches: [{ start: 0, end: 1 }], baseline: "a", replaced: null },
        SAVE,
      ),
    ).toEqual({ kind: "refused" });
    expect(plan("Leaf\n", query("leaf"))).toMatchObject({ kind: "planned" });
    expect(
      planFileReplacement(
        parser,
        "leaf\n",
        "lf",
        parser.planReplacement("leaf\n", query("leaf"), "leaf"),
        SAVE,
      ),
    ).toEqual({ kind: "unchanged" });
  });
});
