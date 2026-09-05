import { describe, expect, it } from "vitest";

import {
  markContinuationLines,
  markListItemPrefix,
  markVerbatimLines,
  resolveLinePrefixes,
  withoutLeadingLinePrefix,
  withoutLinePrefixMarkers,
} from "./linePrefixMarkdown";

const MARKER = "\u0000c";
const ITEM_MARKER = "\u0000i";
const VERBATIM_MARKER = "\u0000v";
// The marker the block separator pass owns, which stands where the containers wrote their prefix
// and is settled after this one.
const SEPARATOR_MARKER = "\u0000j";

// A line as the serializer leaves it: the prefix its containers wrote, the marked record of the
// prefix the file wrote, and the content.
const marked = (written: string, authored: string, content: string) =>
  `${written}${MARKER}${authored}${MARKER}${content}`;

// The same line for an item's own marker, whose record replaces the prefix the containers wrote
// rather than the one a later line stands behind.
const markedItem = (written: string, authored: string, content: string) =>
  `${written}${ITEM_MARKER}${authored}${ITEM_MARKER}${content}`;

// The same line for a block that writes its own indentation, whose record stands behind the
// canonical run rather than in place of it.
const markedVerbatim = (written: string, authored: string, content: string) =>
  `${written}${VERBATIM_MARKER}${authored}${VERBATIM_MARKER}${content}`;

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

describe("markListItemPrefix", () => {
  it("leaves an item standing behind nothing unmarked", () => {
    expect(markListItemPrefix("")).toBe("");
  });

  it("brackets the prefix an item's marker stood behind", () => {
    expect(markListItemPrefix("\t")).toBe(`${ITEM_MARKER}\t${ITEM_MARKER}`);
  });
});

describe("markVerbatimLines", () => {
  it("leaves a block holding no record alone", () => {
    expect(markVerbatimLines("    one", "    ", [])).toBe("    one");
  });

  it("marks each line behind the canonical run the handler wrote", () => {
    expect(markVerbatimLines("    one\n    two", "    ", ["\t", "\t"])).toBe(
      `    ${VERBATIM_MARKER}\t${VERBATIM_MARKER}one\n    ${VERBATIM_MARKER}\t${VERBATIM_MARKER}two`,
    );
  });

  it("leaves a blank line and a line holding no prefix of its own alone", () => {
    expect(markVerbatimLines("    one\n\n    three", "    ", ["\t", "", ""])).toBe(
      `    ${VERBATIM_MARKER}\t${VERBATIM_MARKER}one\n\n    three`,
    );
  });
});

describe("resolveLinePrefixes", () => {
  it("leaves a document holding no marked line alone", () => {
    expect(resolveLinePrefixes("A paragraph.\n")).toBe("A paragraph.\n");
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
      expect(resolveLinePrefixes(`${expected.split("\n")[0]}\n${written}\n`)).toBe(expected);
    });
  });

  describe("writes the prefix an item's marker stood behind", () => {
    it.each([
      {
        expected: "\t- child",
        name: "a tab covering the columns the containers wrote",
        written: markedItem("  ", "\t", "- child"),
      },
      {
        expected: "   - alpha",
        name: "spaces at a root the containers spell nothing at",
        written: markedItem("", "   ", "- alpha"),
      },
      {
        expected: ">\t- a",
        name: "a tab the quote marker's own line spells",
        written: markedItem("> ", ">\t", "- a"),
      },
    ])("writes $name", ({ expected, written }) => {
      expect(resolveLinePrefixes(`${written}\n`)).toBe(`${expected}\n`);
    });

    // A nested item stands past the column the item holding it is written back at, which is the
    // record that item leaves on the line rather than the run the serializer wrote.
    it("measures an item against the record of the item holding it", () => {
      const line = `    ${ITEM_MARKER}\t  ${ITEM_MARKER}${ITEM_MARKER}\t\t${ITEM_MARKER}- c`;

      expect(resolveLinePrefixes(`${line}\n`)).toBe("\t\t- c\n");
    });

    // A continuation line inside a recorded item carries the prefix its own block was written
    // behind, which already holds the item's indentation and the columns its content stands at.
    it("writes the line's own record over the one the item holding it left", () => {
      const line = `    ${ITEM_MARKER}\t  ${ITEM_MARKER}${MARKER}\t  ${MARKER}more`;

      expect(resolveLinePrefixes(`${line}\n`)).toBe("\t  more\n");
    });

    it("carries a marker a later pass owns past the prefix it replaces", () => {
      const line = `  ${SEPARATOR_MARKER}${ITEM_MARKER}\t${ITEM_MARKER}- child`;

      expect(resolveLinePrefixes(`${line}\n`)).toBe(`\t${SEPARATOR_MARKER}- child\n`);
    });
  });

  describe("writes a verbatim line's own prefix", () => {
    it.each([
      {
        expected: "\tcode",
        name: "a tab covering the columns the canonical run wrote",
        written: markedVerbatim("    ", "\t", "code"),
      },
      {
        expected: "> \t  quoted",
        name: "a run inside a quote measuring the columns the containers wrote",
        written: markedVerbatim(">     ", "> \t  ", "quoted"),
      },
    ])("writes $name", ({ expected, written }) => {
      expect(resolveLinePrefixes(`${written}\n`)).toBe(`${expected}\n`);
    });

    // A tab whose run overshoots the column the block's content stands at is expanded by the parse
    // into that content, so restoring it would move the column and the block would reopen deeper.
    it.each([
      {
        expected: ">       x",
        name: "a run measuring wider than the containers wrote",
        written: markedVerbatim(">     ", ">\t\t", "  x"),
      },
      {
        expected: "    x",
        name: "a quote the containers no longer spell",
        written: markedVerbatim("    ", "> \t", "x"),
      },
    ])("withdraws $name", ({ expected, written }) => {
      expect(resolveLinePrefixes(`${written}\n`)).toBe(`${expected}\n`);
    });

    // The content of a verbatim line is the file's own, so a backslash standing before a block
    // marker there is not one the serializer added. A continuation record relaxes the same run.
    it("keeps an escape the line's content spells", () => {
      const line = markedVerbatim("    ", "\t", "\\# x");

      expect(resolveLinePrefixes(`${line}\n`)).toBe(`\t\\# x\n`);
    });
  });

  describe("withdraws an item's prefix the containers no longer take", () => {
    it.each([
      {
        expected: "- alpha",
        name: "a tab four columns past the containers, which opens indented code",
        written: markedItem("", "\t", "- alpha"),
      },
      {
        expected: "    - beta",
        name: "a prefix shallower than the containers spell",
        written: markedItem("    ", "  ", "- beta"),
      },
      {
        expected: "- a",
        name: "a quote marker no container spells",
        written: markedItem("", "> ", "- a"),
      },
      {
        expected: "  > - c",
        name: "a quote marker standing at another column than the containers write it",
        written: markedItem("  > ", ">   ", "- c"),
      },
      {
        expected: "> - alpha",
        name: "a quote marker the record indents and the containers do not",
        written: markedItem("> ", "  > ", "- alpha"),
      },
      {
        expected: "  - c",
        name: "a nested item measured against the item holding it",
        written: `  ${ITEM_MARKER}\t\t${ITEM_MARKER}- c`,
      },
    ])("withdraws $name", ({ expected, written }) => {
      expect(resolveLinePrefixes(`${written}\n`)).toBe(`${expected}\n`);
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
      expect(resolveLinePrefixes(`Text\n${marked("", "    ", content)}\n`)).toBe(
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
      expect(resolveLinePrefixes(`Text\n${marked("", "    ", content)}\n`)).toBe(
        `Text\n    ${content}\n`,
      );
    });

    it("keeps the escape where the line stands under four columns", () => {
      expect(resolveLinePrefixes(`Text\n${marked("", "   ", "\\# heading")}\n`)).toBe(
        "Text\n   \\# heading\n",
      );
    });

    // Two items stacked at three columns each write one run of six, and a line spelling four of
    // them satisfies the outer item and leaves one column rather than the four it appears to have.
    it("keeps the escape where a line only partly spells the indentation two items stack", () => {
      expect(resolveLinePrefixes(`1. aa\n${marked("      ", "    ", "\\# bb")}\n`)).toBe(
        "1. aa\n    \\# bb\n",
      );
    });

    // A quote the line does not spell closes every container inside it, so the columns after it
    // are the line's own and the marker they hold up opens nothing.
    it("takes back the escape where the line stands four columns past a quote it drops", () => {
      expect(resolveLinePrefixes(`> quoted\n${marked("> ", "    ", "\\# cc")}\n`)).toBe(
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
      expect(resolveLinePrefixes(`Text\n${written}\n`)).toBe(`Text\n${expected}\n`);
    });
  });

  it("drops a marker left without the one that closes it", () => {
    expect(resolveLinePrefixes(`Text\n${MARKER}line\n`)).toBe("Text\nline\n");
  });
});

describe("withoutLeadingLinePrefix", () => {
  it.each([
    { name: "a value carrying no record", value: "- alpha", written: "- alpha" },
    {
      name: "a record standing past the head",
      value: `- ${ITEM_MARKER}  ${ITEM_MARKER}- c`,
      written: `- ${ITEM_MARKER}  ${ITEM_MARKER}- c`,
    },
    {
      name: "a marker the closing one never followed",
      value: `${ITEM_MARKER}- alpha`,
      written: `${ITEM_MARKER}- alpha`,
    },
    {
      name: "a marker the closing one follows on a later line",
      value: `${ITEM_MARKER}- alpha\n  ${ITEM_MARKER}`,
      written: `${ITEM_MARKER}- alpha\n  ${ITEM_MARKER}`,
    },
  ])("leaves $name alone", ({ value, written }) => {
    expect(withoutLeadingLinePrefix(value)).toBe(written);
  });

  it.each([
    { name: "an item's own", value: markedItem("", "  ", "- c"), written: "- c" },
    { name: "a continuation line's", value: marked("", "  ", "text"), written: "text" },
  ])("drops $name record from the head of the value", ({ value, written }) => {
    expect(withoutLeadingLinePrefix(value)).toBe(written);
  });
});

describe("withoutLinePrefixMarkers", () => {
  it.each([
    { name: "a value carrying no record", value: "- alpha", written: "- alpha" },
    {
      name: "the record an item opens its line with",
      value: markedItem("", "   ", "- alpha"),
      written: "- alpha",
    },
    {
      name: "a record on each line of a block",
      value: `one\n${marked("  ", "> ", "two")}`,
      written: `one\n  two`,
    },
    {
      name: "a marker the closing one never followed",
      value: `${ITEM_MARKER}- alpha`,
      written: "- alpha",
    },
  ])("reads a value without $name", ({ value, written }) => {
    expect(withoutLinePrefixMarkers(value)).toBe(written);
  });

  // A marker another pass owns spends the same character and is settled after this one.
  it("leaves a marker another pass owns where it stands", () => {
    expect(withoutLinePrefixMarkers(`${SEPARATOR_MARKER}${markedItem("", "  ", "- a")}`)).toBe(
      `${SEPARATOR_MARKER}- a`,
    );
  });
});
