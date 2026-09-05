import { describe, expect, it } from "vitest";

import {
  CONTINUATIONS_ATTRIBUTE_NAME,
  findContinuations,
  readContinuations,
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
