import { describe, expect, it } from "vitest";

import { formatMarkdownForSave } from "./documentSerialization";

describe("document serialization", () => {
  it("normalizes line endings to CRLF", () => {
    expect(formatMarkdownForSave("first\nsecond\n", "crlf", true)).toBe("first\r\nsecond\r\n");
  });

  it("normalizes line endings to LF", () => {
    expect(formatMarkdownForSave("first\r\nsecond\r\n", "lf", false)).toBe("first\nsecond");
  });

  it.each([
    { markdown: "text", on: "text\n", off: "text" },
    { markdown: "text\n", on: "text\n", off: "text" },
    { markdown: "text\n\n", on: "text\n\n", off: "text\n\n" },
    { markdown: "text\n\n\n", on: "text\n\n\n", off: "text\n\n\n" },
    { markdown: "\n", on: "\n", off: "\n" },
    { markdown: "\n\n\n", on: "\n\n\n", off: "\n\n\n" },
    { markdown: "", on: "", off: "" },
  ])("writes $markdown as $on with a final newline and $off without", ({ markdown, on, off }) => {
    expect(formatMarkdownForSave(markdown, "lf", true)).toBe(on);
    expect(formatMarkdownForSave(markdown, "lf", false)).toBe(off);
    expect(formatMarkdownForSave(markdown, "crlf", true)).toBe(on.replaceAll("\n", "\r\n"));
    expect(formatMarkdownForSave(markdown, "crlf", false)).toBe(off.replaceAll("\n", "\r\n"));
  });

  it("reads trailing blank lines in any line ending before writing them in the chosen one", () => {
    expect(formatMarkdownForSave("text\r\n\r\n", "lf", false)).toBe("text\n\n");
    expect(formatMarkdownForSave("text\r\r\n\n", "crlf", false)).toBe("text\r\n\r\n\r\n");
  });
});
