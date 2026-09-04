import { describe, expect, it } from "vitest";

import {
  findParagraphContinuations,
  PARAGRAPH_CONTINUATIONS_ATTRIBUTE_NAME,
  readParagraphContinuations,
  resolveParagraphContinuations,
} from "./continuationMarkdown";

const MARKER = "\u0000c";

// A line as the serializer leaves it: the prefix its containers wrote, the marked record of the
// prefix the file wrote, and the content.
const marked = (written: string, authored: string, content: string) =>
  `${written}${MARKER}${authored}${MARKER}${content}`;

describe("readParagraphContinuations", () => {
  it.each([
    { continuations: [], name: "an attribute holding no lines", source: { continuations: [] } },
    {
      continuations: ["> ", ""],
      name: "the lines an attribute holds",
      source: { continuations: ["> ", ""] },
    },
    { continuations: [], name: "a node carrying no attribute", source: {} },
    { continuations: [], name: "an attribute that is not an array", source: { continuations: 2 } },
    {
      continuations: [],
      name: "an array holding anything but lines",
      source: { continuations: ["> ", 4] },
    },
  ])("reads $name", ({ continuations, source }) => {
    expect(readParagraphContinuations(source)).toEqual(continuations);
  });

  it("names the attribute the schema carries", () => {
    expect(
      readParagraphContinuations({ [PARAGRAPH_CONTINUATIONS_ATTRIBUTE_NAME]: ["  "] }),
    ).toEqual(["  "]);
  });
});

describe("findParagraphContinuations", () => {
  it.each([
    { continuations: [], name: "a paragraph written on one line", raw: "One line" },
    {
      continuations: [""],
      name: "a quoted line the file left lazy",
      raw: "First quoted line\nlazy continuation",
    },
    {
      continuations: ["> ", ""],
      name: "a nested quote one line spells and the next does not",
      raw: "nested first\n> lazy one\nlazy two",
    },
    {
      continuations: ["    "],
      name: "the indentation a line was written with",
      raw: "#no separator\n    # indented as code",
    },
    {
      continuations: ["  ", "  "],
      name: "the indentation an item's own lines carry",
      raw: "item\n  second\n  third",
    },
    {
      continuations: ["\t> \t"],
      name: "a prefix spelled with tabs",
      raw: "quoted\n\t> \tcontinued",
    },
    {
      continuations: ["  "],
      name: "a line a carriage return ends",
      raw: "item\r  second",
    },
    {
      continuations: ["  "],
      name: "a line a carriage return and a line feed end",
      raw: "item\r\n  second",
    },
  ])("reads $name", ({ continuations, raw }) => {
    expect(findParagraphContinuations(raw)).toEqual(continuations);
  });
});

describe("resolveParagraphContinuations", () => {
  it("leaves a document holding no marked line alone", () => {
    expect(resolveParagraphContinuations("A paragraph.\n")).toBe("A paragraph.\n");
  });

  describe("writes the prefix the file wrote", () => {
    it.each([
      {
        expected: "> First\nlazy\n",
        name: "a quote marker the line was written without",
        written: marked("> ", "", "lazy"),
      },
      {
        expected: "- item\nlazy\n",
        name: "the indentation an item's line was written without",
        written: marked("  ", "", "lazy"),
      },
      {
        expected: "> > nested\n> lazy\n",
        name: "the one quote marker of two the line spells",
        written: marked("> > ", "> ", "lazy"),
      },
      {
        expected: "#no separator\n    # indented\n",
        name: "the indentation a line was written with",
        written: marked("", "    ", "\\# indented"),
      },
      {
        expected: "> quoted\n>     # indented\n",
        name: "indentation past the quote marker the line spells",
        written: marked("> ", ">     ", "\\# indented"),
      },
    ])("writes $name", ({ expected, written }) => {
      expect(resolveParagraphContinuations(`${expected.split("\n")[0]}\n${written}\n`)).toBe(
        expected,
      );
    });
  });

  describe("takes back the escape a line four columns deep does not need", () => {
    it.each([
      { content: "\\# heading", expected: "# heading", name: "a hash" },
      { content: "\\> quote", expected: "> quote", name: "a quote marker" },
      { content: "\\- item", expected: "- item", name: "a bullet" },
      { content: "\\+ item", expected: "+ item", name: "a plus bullet" },
      { content: "\\=== underline", expected: "=== underline", name: "a setext underline" },
      { content: "1\\. item", expected: "1. item", name: "an ordered marker" },
      { content: "12\\) item", expected: "12) item", name: "a parenthesised ordered marker" },
    ])("takes back the escape on $name", ({ content, expected }) => {
      expect(resolveParagraphContinuations(`Text\n${marked("", "    ", content)}\n`)).toBe(
        `Text\n    ${expected}\n`,
      );
    });

    it.each([
      { content: "\\*emphasis\\*", name: "an asterisk, which could delimit a mark" },
      { content: "\\_underscore\\_", name: "an underscore, which could delimit a mark" },
      { content: "\\`code\\`", name: "a backtick, which could open a code span" },
      { content: "\\~strike\\~", name: "a tilde, which could open a strikethrough" },
      { content: "\\[label]", name: "a bracket, which could open a link" },
      { content: "\\<span>", name: "an angle, which could open raw HTML" },
    ])("keeps the escape on $name", ({ content }) => {
      expect(resolveParagraphContinuations(`Text\n${marked("", "    ", content)}\n`)).toBe(
        `Text\n    ${content}\n`,
      );
    });

    it("keeps the escape where the line stands under four columns", () => {
      expect(resolveParagraphContinuations(`Text\n${marked("", "   ", "\\# heading")}\n`)).toBe(
        "Text\n   \\# heading\n",
      );
    });

    // Two items stacked at three columns each write one run of six, and a line spelling four of
    // them satisfies the outer item and leaves one column rather than the four it appears to have.
    it("keeps the escape where a line only partly spells the indentation two items stack", () => {
      expect(resolveParagraphContinuations(`1. aa\n${marked("      ", "    ", "\\# bb")}\n`)).toBe(
        "1. aa\n    \\# bb\n",
      );
    });

    // A quote the line does not spell closes every container inside it, so the columns after it
    // are the line's own and the marker they hold up opens nothing.
    it("takes back the escape where the line stands four columns past a quote it drops", () => {
      expect(resolveParagraphContinuations(`> quoted\n${marked("> ", "    ", "\\# cc")}\n`)).toBe(
        "> quoted\n    # cc\n",
      );
    });
  });

  describe("withdraws the prefix the document no longer holds", () => {
    it.each([
      {
        name: "a quote marker no container spells",
        written: marked("", "> ", "line"),
        expected: "line",
      },
      {
        name: "a quote marker deeper than the containers hold",
        written: marked("> ", "> > ", "line"),
        expected: "> line",
      },
    ])("withdraws $name", ({ expected, written }) => {
      expect(resolveParagraphContinuations(`Text\n${written}\n`)).toBe(`Text\n${expected}\n`);
    });
  });

  it("drops a marker left without the one that closes it", () => {
    expect(resolveParagraphContinuations(`Text\n${MARKER}line\n`)).toBe("Text\nline\n");
  });
});
