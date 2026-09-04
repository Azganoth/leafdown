import { describe, expect, it } from "vitest";

import {
  CONTINUATIONS_ATTRIBUTE_NAME,
  findContinuations,
  markContinuationLines,
  readContinuations,
  resolveContinuations,
} from "./continuationMarkdown";

const MARKER = "\u0000c";

// A line as the serializer leaves it: the prefix its containers wrote, the marked record of the
// prefix the file wrote, and the content.
const marked = (written: string, authored: string, content: string) =>
  `${written}${MARKER}${authored}${MARKER}${content}`;

describe("readContinuations", () => {
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
    expect(readContinuations(source)).toEqual(continuations);
  });

  it("names the attribute the schema carries", () => {
    expect(readContinuations({ [CONTINUATIONS_ATTRIBUTE_NAME]: ["  "] })).toEqual(["  "]);
  });
});

describe("findContinuations", () => {
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
    expect(findContinuations(raw)).toEqual(continuations);
  });
});

describe("markContinuationLines", () => {
  it("leaves a block holding no record alone", () => {
    expect(markContinuationLines("One\ntwo", [])).toBe("One\ntwo");
  });

  it("marks each line the record reaches", () => {
    expect(markContinuationLines("One\ntwo\nthree", ["> ", "  "])).toBe(
      `One\n${MARKER}> ${MARKER}two\n${MARKER}  ${MARKER}three`,
    );
  });

  // A line the editor added to a block stands past everything the file recorded for it.
  it("leaves a line past the record for the containers to prefix", () => {
    expect(markContinuationLines("One\ntwo\n=====", ["  "])).toBe(
      `One\n${MARKER}  ${MARKER}two\n=====`,
    );
  });

  it("leaves a blank line alone", () => {
    expect(markContinuationLines("One\n\nthree", ["  ", "  "])).toBe(
      `One\n\n${MARKER}  ${MARKER}three`,
    );
  });
});

describe("resolveContinuations", () => {
  it("leaves a document holding no marked line alone", () => {
    expect(resolveContinuations("A paragraph.\n")).toBe("A paragraph.\n");
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
      expect(resolveContinuations(`${expected.split("\n")[0]}\n${written}\n`)).toBe(expected);
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
      expect(resolveContinuations(`Text\n${marked("", "    ", content)}\n`)).toBe(
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
      expect(resolveContinuations(`Text\n${marked("", "    ", content)}\n`)).toBe(
        `Text\n    ${content}\n`,
      );
    });

    it("keeps the escape where the line stands under four columns", () => {
      expect(resolveContinuations(`Text\n${marked("", "   ", "\\# heading")}\n`)).toBe(
        "Text\n   \\# heading\n",
      );
    });

    // Two items stacked at three columns each write one run of six, and a line spelling four of
    // them satisfies the outer item and leaves one column rather than the four it appears to have.
    it("keeps the escape where a line only partly spells the indentation two items stack", () => {
      expect(resolveContinuations(`1. aa\n${marked("      ", "    ", "\\# bb")}\n`)).toBe(
        "1. aa\n    \\# bb\n",
      );
    });

    // A quote the line does not spell closes every container inside it, so the columns after it
    // are the line's own and the marker they hold up opens nothing.
    it("takes back the escape where the line stands four columns past a quote it drops", () => {
      expect(resolveContinuations(`> quoted\n${marked("> ", "    ", "\\# cc")}\n`)).toBe(
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
      expect(resolveContinuations(`Text\n${written}\n`)).toBe(`Text\n${expected}\n`);
    });
  });

  it("drops a marker left without the one that closes it", () => {
    expect(resolveContinuations(`Text\n${MARKER}line\n`)).toBe("Text\nline\n");
  });
});
