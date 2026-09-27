import { describe, expect, it } from "vitest";

import {
  CONTINUATIONS_ATTRIBUTE_NAME,
  findContinuations,
  readContinuations,
  splitAtomLinePrefix,
} from "./continuationMarkdown";

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

describe("splitAtomLinePrefix", () => {
  it.each([
    {
      name: "a line whose indentation the parse took whole",
      recorded: "  ",
      kept: "",
      split: { kept: "", prefix: "  " },
    },
    {
      name: "the indentation raw HTML kept",
      recorded: "    ",
      kept: " ",
      split: { kept: " ", prefix: "   " },
    },
    {
      name: "the indentation raw HTML kept inside a quote",
      recorded: ">     ",
      kept: " ",
      split: { kept: " ", prefix: ">    " },
    },
    {
      name: "the indentation a code span kept whole",
      recorded: "      ",
      kept: "    ",
      split: { kept: "    ", prefix: "  " },
    },
    {
      name: "a tab the parse took part of, which raw HTML spells back",
      recorded: "\t\t",
      kept: "   ",
      split: { kept: "\t", prefix: "\t" },
    },
    {
      name: "a tab the parse took part of before a space",
      recorded: "\t ",
      kept: "  ",
      split: { kept: "\t ", prefix: "" },
    },
  ])("splits $name", ({ kept, recorded, split }) => {
    expect(splitAtomLinePrefix(recorded, kept, true)).toEqual(split);
  });

  it.each([
    {
      name: "a tab an item took part of",
      recorded: "\t",
      kept: "  ",
      split: { kept: "  ", prefix: "  " },
    },
    {
      name: "a tab a quote took part of",
      recorded: ">\t",
      kept: "  ",
      split: { kept: "  ", prefix: "> " },
    },
  ])("writes $name as spaces where the value cannot spell it", ({ kept, recorded, split }) => {
    expect(splitAtomLinePrefix(recorded, kept, false)).toEqual(split);
  });

  it("keeps a record the value's whitespace does not stand at the end of", () => {
    expect(splitAtomLinePrefix("  ", "   ", true)).toBeUndefined();
  });
});
