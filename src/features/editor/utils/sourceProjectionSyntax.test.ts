import { describe, expect, it } from "vitest";

import {
  createProjectionMarkDescriptor,
  createProjectionSource,
  getProjectionReplacement,
  getProjectionSourceContentBounds,
  getSourceMarkers,
  normalizeProjectionSourceAfterEdit,
  parseProjectionSource,
  type ProjectionMarkerCharacter,
  type ProjectionMarkName,
} from "./sourceProjectionSyntax";

interface ExpectedProjectionMark {
  marker: ProjectionMarkerCharacter;
  markName: ProjectionMarkName;
}

interface ExpectedMarkSource {
  closing: string;
  marks: ExpectedProjectionMark[];
  opening: string;
  text: string;
}

const expectedMark = (
  markName: ProjectionMarkName,
  marker: ProjectionMarkerCharacter,
): ExpectedProjectionMark => ({ marker, markName });

const expectMarkSource = (source: string, expected: ExpectedMarkSource) => {
  const parsed = parseProjectionSource(source);

  expect(parsed).toMatchObject({
    closing: expected.closing,
    opening: expected.opening,
    text: expected.text,
    type: "mark",
  });

  expect(parsed.type).toBe("mark");

  if (parsed.type === "mark") {
    expect(
      parsed.marks.map((mark) => ({
        marker: mark.marker,
        markName: mark.markName,
      })),
    ).toEqual(expected.marks);
  }
};

describe("source projection syntax", () => {
  it.each([
    {
      closing: "*",
      marks: [expectedMark("emphasis", "*")],
      opening: "*",
      source: "*Emphasis*",
      text: "Emphasis",
    },
    {
      closing: "__",
      marks: [expectedMark("strong", "_")],
      opening: "__",
      source: "__Strong__",
      text: "Strong",
    },
    {
      closing: "***",
      marks: [expectedMark("strong", "*"), expectedMark("emphasis", "*")],
      opening: "***",
      source: "***Strong emphasis***",
      text: "Strong emphasis",
    },
    {
      closing: "___",
      marks: [expectedMark("strong", "_"), expectedMark("emphasis", "_")],
      opening: "___",
      source: "___Strong emphasis___",
      text: "Strong emphasis",
    },
    {
      closing: "~~",
      marks: [expectedMark("strike_through", "~")],
      opening: "~~",
      source: "~~Strikethrough~~",
      text: "Strikethrough",
    },
    {
      closing: "``",
      marks: [expectedMark("inlineCode", "`")],
      opening: "``",
      source: "``Code ` content``",
      text: "Code ` content",
    },
  ])("parses simple delimited source $source", ({ source, ...expected }) => {
    expectMarkSource(source, expected);
  });

  it.each([
    {
      closing: "_**",
      opening: "**_",
      marks: [expectedMark("strong", "*"), expectedMark("emphasis", "_")],
      source: "**_Nested_**",
    },
    {
      closing: "**_",
      opening: "_**",
      marks: [expectedMark("strong", "*"), expectedMark("emphasis", "_")],
      source: "_**Nested**_",
    },
    {
      closing: "*__",
      opening: "__*",
      marks: [expectedMark("strong", "_"), expectedMark("emphasis", "*")],
      source: "__*Nested*__",
    },
    {
      closing: "__*",
      opening: "*__",
      marks: [expectedMark("strong", "_"), expectedMark("emphasis", "*")],
      source: "*__Nested__*",
    },
  ])("parses mixed nested source $source", ({ closing, marks, opening, source }) => {
    expectMarkSource(source, {
      closing,
      marks,
      opening,
      text: "Nested",
    });
  });

  it("parses strikethrough around nested strong and emphasis", () => {
    expectMarkSource("~~_**Nested**_~~", {
      closing: "**_~~",
      marks: [
        expectedMark("strike_through", "~"),
        expectedMark("strong", "*"),
        expectedMark("emphasis", "_"),
      ],
      opening: "~~_**",
      text: "Nested",
    });
  });

  it.each([
    "plain text",
    "**Mismatched*",
    "*",
    "__",
    "[Link](",
    "[Link](https://example.com)",
    "<https://example.com>",
  ])("treats unsupported source %s as literal", (source) => {
    expect(parseProjectionSource(source)).toEqual({
      text: source,
      type: "literal",
    });
  });

  it("creates replacements from parsed source text", () => {
    expect(getProjectionReplacement(parseProjectionSource("plain text"))).toEqual({
      text: "plain text",
      type: "literal",
    });

    expect(getProjectionReplacement(parseProjectionSource("**Strong**"))).toEqual({
      marks: [{ attrs: { marker: "*" }, marker: "*", markName: "strong" }],
      text: "Strong",
      type: "marked",
    });
  });

  it("uses source marker attrs when creating projection delimiters", () => {
    expect(
      getSourceMarkers([
        { attrs: { marker: "*" }, marker: "*", markName: "strong" },
        { attrs: { marker: "_" }, marker: "_", markName: "emphasis" },
      ]),
    ).toEqual({
      closing: "**_",
      opening: "_**",
    });
  });

  it("wraps nested projection source with strikethrough markers", () => {
    expect(
      getSourceMarkers([
        { attrs: { marker: "*" }, marker: "*", markName: "strong" },
        { attrs: { marker: "_" }, marker: "_", markName: "emphasis" },
        { attrs: { marker: "~" }, marker: "~", markName: "strike_through" },
      ]),
    ).toEqual({
      closing: "**_~~",
      opening: "~~_**",
    });
  });

  it("uses a backtick run that cannot occur inside projected inline code", () => {
    expect(
      getSourceMarkers([{ attrs: { marker: "`" }, marker: "`", markName: "inlineCode" }], "a``b"),
    ).toEqual({
      closing: "```",
      opening: "```",
    });
  });

  it.each([
    { source: "`` `leading ``", text: "`leading" },
    { source: "`` trailing` ``", text: "trailing`" },
    { source: "`` `both` ``", text: "`both`" },
    { source: "`` ` ``", text: "`" },
  ])("creates valid padded source for inline code with boundary backticks", ({ source, text }) => {
    const marks = [createProjectionMarkDescriptor("inlineCode", {})];

    expect(createProjectionSource(marks, text)).toBe(source);
    expectMarkSource(source, {
      closing: "``",
      marks: [expectedMark("inlineCode", "`")],
      opening: "``",
      text,
    });
    expect(getProjectionSourceContentBounds(source)).toEqual({
      from: 3,
      to: 3 + text.length,
    });
  });

  it("normalizes inline-code edits that add a boundary backtick", () => {
    expect(
      normalizeProjectionSourceAfterEdit("`Code``", { delimiterSide: null, kind: "insert" }),
    ).toBe("`` Code` ``");
    expect(
      normalizeProjectionSourceAfterEdit("``Code`", { delimiterSide: null, kind: "insert" }),
    ).toBe("`` `Code ``");
  });

  it("normalizes inline-code source whitespace according to Markdown code-span rules", () => {
    expectMarkSource("` code `", {
      closing: "`",
      marks: [expectedMark("inlineCode", "`")],
      opening: "`",
      text: "code",
    });
  });

  it("keeps link-like text inside ordinary mark source literal", () => {
    expectMarkSource("**[Link](https://example.com)**", {
      closing: "**",
      marks: [expectedMark("strong", "*")],
      opening: "**",
      text: "[Link](https://example.com)",
    });
  });

  it("normalizes descriptor marker attrs", () => {
    expect(
      createProjectionMarkDescriptor("emphasis", { marker: "invalid", title: "Soft" }),
    ).toEqual({
      attrs: { marker: "*", title: "Soft" },
      marker: "*",
      markName: "emphasis",
    });
  });

  it("normalizes delimiter edits without crossing supported marker counts", () => {
    expect(
      normalizeProjectionSourceAfterEdit("****Strong****", {
        delimiterSide: "opening",
        kind: "insert",
      }),
    ).toBe("***Strong***");

    expect(
      normalizeProjectionSourceAfterEdit("**Strong*", {
        delimiterSide: null,
        kind: "delete",
      }),
    ).toBe("*Strong*");
  });
});
