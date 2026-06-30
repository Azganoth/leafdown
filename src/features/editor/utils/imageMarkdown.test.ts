import { describe, expect, it } from "vitest";

import { parseImageMarkdown, serializeImageMarkdown } from "./imageMarkdown";

describe("imageMarkdown", () => {
  it("serializes image attrs into editable Markdown", () => {
    expect(
      serializeImageMarkdown({
        alt: "Sample",
        src: "./assets/icon.png",
        title: "",
      }),
    ).toBe("![Sample](./assets/icon.png)");

    expect(
      serializeImageMarkdown({
        alt: "A ] bracket",
        src: "./assets/icon.png",
        title: 'A "quoted" title',
      }),
    ).toBe('![A \\] bracket](./assets/icon.png "A \\"quoted\\" title")');

    expect(
      serializeImageMarkdown({
        alt: "A [ and ] bracket",
        src: "./assets/icon with spaces.png",
        title: "",
      }),
    ).toBe("![A \\[ and \\] bracket](<./assets/icon with spaces.png>)");
  });

  it.each([
    [
      '![Updated](./assets/updated.png "Updated title")',
      { alt: "Updated", src: "./assets/updated.png", title: "Updated title" },
    ],
    [
      "![A \\] bracket](./assets/icon(1).png)",
      { alt: "A ] bracket", src: "./assets/icon(1).png", title: "" },
    ],
    [
      "![A \\[ bracket](./assets/icon.png)",
      { alt: "A [ bracket", src: "./assets/icon.png", title: "" },
    ],
    [
      "![Alt](<./assets/icon with spaces.png> 'Single quoted title')",
      { alt: "Alt", src: "./assets/icon with spaces.png", title: "Single quoted title" },
    ],
    [
      "![Alt](./assets/icon.png (Parenthesized title))",
      { alt: "Alt", src: "./assets/icon.png", title: "Parenthesized title" },
    ],
    [
      '![Alt](./assets/icon.png "A \\"quoted\\" title")',
      { alt: "Alt", src: "./assets/icon.png", title: 'A "quoted" title' },
    ],
  ])("parses %s", (markdown, attrs) => {
    expect(parseImageMarkdown(markdown)).toEqual(attrs);
  });

  it("round-trips serialized image attrs", () => {
    const attrs = {
      alt: "A [ and ] bracket",
      src: "./assets/icon with spaces.png",
      title: 'A "quoted" title',
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
