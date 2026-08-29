import { describe, expect, it } from "vitest";

import {
  parseImageMarkdown,
  serializeImageMarkdown,
  type ImageDefinition,
  type ImageMarkdownAttrs,
} from "./imageMarkdown";

type InlineImageAttrs = Omit<ImageMarkdownAttrs, "referenceLabel" | "referenceType">;

const inlineImageAttrs = (attrs: InlineImageAttrs): ImageMarkdownAttrs => ({
  referenceLabel: "",
  referenceType: null,
  ...attrs,
});

describe("imageMarkdown", () => {
  it("serializes image attrs into editable Markdown", () => {
    expect(
      serializeImageMarkdown(
        inlineImageAttrs({
          alt: "Sample",
          src: "./assets/icon.png",
          title: "",
          titleMarker: '"',
        }),
      ),
    ).toBe("![Sample](./assets/icon.png)");

    expect(
      serializeImageMarkdown(
        inlineImageAttrs({
          alt: "A ] bracket",
          src: "./assets/icon.png",
          title: 'A "quoted" title',
          titleMarker: '"',
        }),
      ),
    ).toBe('![A \\] bracket](./assets/icon.png "A \\"quoted\\" title")');

    expect(
      serializeImageMarkdown(
        inlineImageAttrs({
          alt: "A [ and ] bracket",
          src: "./assets/icon with spaces.png",
          title: "",
          titleMarker: '"',
        }),
      ),
    ).toBe("![A \\[ and \\] bracket](<./assets/icon with spaces.png>)");
  });

  it.each([
    ["'" as const, "![Sample](./assets/icon.png 'A title')"],
    ['"' as const, '![Sample](./assets/icon.png "A title")'],
    ["(" as const, "![Sample](./assets/icon.png (A title))"],
  ])("serializes a title authored with %s in the form it was authored in", (marker, expected) => {
    expect(
      serializeImageMarkdown(
        inlineImageAttrs({
          alt: "Sample",
          src: "./assets/icon.png",
          title: "A title",
          titleMarker: marker,
        }),
      ),
    ).toBe(expected);
  });

  // A parenthesis would have to be escaped inside a run CommonMark reads between matching ones, so
  // the title moves to a quote that holds it bare instead.
  it("serializes a parenthesized title that holds a parenthesis as a quoted title", () => {
    expect(
      serializeImageMarkdown(
        inlineImageAttrs({
          alt: "Sample",
          src: "./assets/icon.png",
          title: "A (nested) title",
          titleMarker: "(",
        }),
      ),
    ).toBe('![Sample](./assets/icon.png "A (nested) title")');
  });

  it.each([
    [
      '![Updated](./assets/updated.png "Updated title")',
      {
        alt: "Updated",
        src: "./assets/updated.png",
        title: "Updated title",
        titleMarker: '"',
      },
    ],
    [
      "![A \\] bracket](./assets/icon(1).png)",
      { alt: "A ] bracket", src: "./assets/icon(1).png", title: "", titleMarker: '"' },
    ],
    [
      "![A \\[ bracket](./assets/icon.png)",
      { alt: "A [ bracket", src: "./assets/icon.png", title: "", titleMarker: '"' },
    ],
    [
      "![Alt](<./assets/icon with spaces.png> 'Single quoted title')",
      {
        alt: "Alt",
        src: "./assets/icon with spaces.png",
        title: "Single quoted title",
        titleMarker: "'",
      },
    ],
    [
      "![Alt](./assets/icon.png (Parenthesized title))",
      {
        alt: "Alt",
        src: "./assets/icon.png",
        title: "Parenthesized title",
        titleMarker: "(",
      },
    ],
    [
      '![Alt](./assets/icon.png "A \\"quoted\\" title")',
      {
        alt: "Alt",
        src: "./assets/icon.png",
        title: 'A "quoted" title',
        titleMarker: '"',
      },
    ],
  ])("parses %s", (markdown, attrs) => {
    expect(parseImageMarkdown(markdown)).toEqual(inlineImageAttrs(attrs as InlineImageAttrs));
  });

  it("round-trips serialized image attrs", () => {
    const attrs = inlineImageAttrs({
      alt: "A [ and ] bracket",
      src: "./assets/icon with spaces.png",
      title: 'A "quoted" title',
      titleMarker: '"',
    });

    expect(parseImageMarkdown(serializeImageMarkdown(attrs))).toEqual(attrs);
  });

  const LEAF_DEFINITION: ImageDefinition = {
    src: "../assets/leaf.svg",
    title: "Leaf",
    titleMarker: '"',
  };
  const resolveLeaf = (label: string) => (label === "leaf" ? LEAF_DEFINITION : null);

  it.each([
    ["full" as const, "Reference leaf", "![Reference leaf][leaf]"],
    ["collapsed" as const, "leaf", "![leaf][]"],
    ["shortcut" as const, "leaf", "![leaf]"],
    // A form that no longer spells its label is written as the one that names it.
    ["collapsed" as const, "Renamed", "![Renamed][leaf]"],
    ["shortcut" as const, "Renamed", "![Renamed][leaf]"],
  ])("serializes a %s reference", (referenceType, alt, expected) => {
    expect(
      serializeImageMarkdown({
        alt,
        referenceLabel: "leaf",
        referenceType,
        src: LEAF_DEFINITION.src,
        title: LEAF_DEFINITION.title,
        titleMarker: LEAF_DEFINITION.titleMarker,
      }),
    ).toBe(expected);
  });

  it.each([
    ["![Reference leaf][leaf]", "full" as const, "Reference leaf", "leaf"],
    ["![leaf][]", "collapsed" as const, "leaf", "leaf"],
    ["![leaf]", "shortcut" as const, "leaf", "leaf"],
    // The label matches its definition however it is cased and spaced.
    ["![Reference leaf][  LEAF ]", "full" as const, "Reference leaf", "  LEAF "],
  ])(
    "parses %s against the definitions the document holds",
    (markdown, referenceType, alt, referenceLabel) => {
      expect(parseImageMarkdown(markdown, resolveLeaf)).toEqual({
        alt,
        referenceLabel,
        referenceType,
        ...LEAF_DEFINITION,
      });
    },
  );

  it.each(["![Reference leaf][missing]", "![missing]", "![missing][]", "![Reference leaf][leaf"])(
    "rejects a reference no definition resolves: %s",
    (markdown) => {
      expect(parseImageMarkdown(markdown, resolveLeaf)).toBeNull();
    },
  );

  it.each(["[Alt](./assets/icon.png)", "![Alt] ./assets/icon.png", "![Alt](./assets/icon.png"])(
    "rejects invalid image Markdown: %s",
    (markdown) => {
      expect(parseImageMarkdown(markdown)).toBeNull();
    },
  );
});
