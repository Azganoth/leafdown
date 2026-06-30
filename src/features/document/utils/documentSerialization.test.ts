import { describe, expect, it } from "vitest";

import { formatMarkdownForSave } from "./documentSerialization";

describe("document serialization", () => {
  it("normalizes line endings to CRLF", () => {
    expect(formatMarkdownForSave("first\nsecond\n", "crlf", true)).toBe("first\r\nsecond\r\n");
  });

  it("normalizes line endings to LF", () => {
    expect(formatMarkdownForSave("first\r\nsecond\r\n", "lf", false)).toBe("first\nsecond");
  });

  it("removes trailing line endings before applying the final-newline setting", () => {
    expect(formatMarkdownForSave("first\r\nsecond\n\n", "lf", false)).toBe("first\nsecond");
  });

  it("adds one final newline when enabled", () => {
    expect(formatMarkdownForSave("first\nsecond", "lf", true)).toBe("first\nsecond\n");
  });

  it("keeps empty documents empty", () => {
    expect(formatMarkdownForSave("", "lf", true)).toBe("");
  });
});
