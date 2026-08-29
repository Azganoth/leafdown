import { describe, expect, it } from "vitest";

import { parseImageMarkdown, serializeImageMarkdown } from "./imageMarkdown";

describe("imageMarkdown", () => {
  it("serializes image attrs into editable Markdown", () => {
    expect(
      serializeImageMarkdown({
        alt: "Sample",
        src: "./assets/icon.png",
        title: "",
        titleMarker: '"',
      }),
    ).toBe("![Sample](./assets/icon.png)");

    expect(
      serializeImageMarkdown({
        alt: "A ] bracket",
        src: "./assets/icon.png",
        title: 'A "quoted" title',
        titleMarker: '"',
      }),
    ).toBe('![A \\] bracket](./assets/icon.png "A \\"quoted\\" title")');

    expect(
      serializeImageMarkdown({
        alt: "A [ and ] bracket",
        src: "./assets/icon with spaces.png",
        title: "",
        titleMarker: '"',
      }),
    ).toBe("![A \\[ and \\] bracket](<./assets/icon with spaces.png>)");
  });

  it.each([
    ["'" as const, "![Sample](./assets/icon.png 'A title')"],
    ['"' as const, '![Sample](./assets/icon.png "A title")'],
    ["(" as const, "![Sample](./assets/icon.png (A title))"],
  ])("serializes a title authored with %s in the form it was authored in", (marker, expected) => {
    expect(
      serializeImageMarkdown({
        alt: "Sample",
        src: "./assets/icon.png",
        title: "A title",
        titleMarker: marker,
      }),
    ).toBe(expected);
  });

  // A parenthesis would have to be escaped inside a run CommonMark reads between matching ones, so
  // the title moves to a quote that holds it bare instead.
  it("serializes a parenthesized title that holds a parenthesis as a quoted title", () => {
    expect(
      serializeImageMarkdown({
        alt: "Sample",
        src: "./assets/icon.png",
        title: "A (nested) title",
        titleMarker: "(",
      }),
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
    expect(parseImageMarkdown(markdown)).toEqual(attrs);
  });

  it("round-trips serialized image attrs", () => {
    const attrs = {
      alt: "A [ and ] bracket",
      src: "./assets/icon with spaces.png",
      title: 'A "quoted" title',
      titleMarker: '"' as const,
    };

    expect(parseImageMarkdown(serializeImageMarkdown(attrs))).toEqual(attrs);
  });

  it.each(["[Alt](./assets/icon.png)", "![Alt] ./assets/icon.png", "![Alt](./assets/icon.png"])(
    "rejects invalid image Markdown: %s",
    (markdown) => {
      expect(parseImageMarkdown(markdown)).toBeNull();
    },
  );
});
