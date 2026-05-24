import { describe, expect, it } from "vitest";

import { formatMarkdownForSave } from "./documentSerialization";

describe("document serialization", () => {
  it("normalizes save output with the active line ending and final-newline setting", () => {
    expect(formatMarkdownForSave("first\nsecond\n", "crlf", true)).toBe("first\r\nsecond\r\n");
    expect(formatMarkdownForSave("first\r\nsecond\r\n", "lf", false)).toBe("first\nsecond");
    expect(formatMarkdownForSave("", "lf", true)).toBe("");
  });
});
