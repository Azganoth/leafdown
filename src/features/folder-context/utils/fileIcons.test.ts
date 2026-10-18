import { describe, expect, it } from "vitest";

import { getFileIconKind } from "./fileIcons";

describe("getFileIconKind", () => {
  it.each([
    ["cover.png", "image"],
    ["demo.mp4", "video"],
    ["memo.m4a", "audio"],
    ["build.ts", "code"],
    ["config.json", "data"],
    ["budget.csv", "spreadsheet"],
    ["backup.zip", "archive"],
    ["paper.pdf", "pdf"],
    ["notes.txt", "document"],
  ] as const)("classifies %s as %s", (fileName, kind) => {
    expect(getFileIconKind(fileName)).toBe(kind);
  });

  it("matches extensions regardless of case", () => {
    expect(getFileIconKind("SCAN.PDF")).toBe("pdf");
    expect(getFileIconKind("Photo.JpEg")).toBe("image");
  });

  it("reads only the last extension of a name with several", () => {
    expect(getFileIconKind("site.backup.tar.gz")).toBe("archive");
    expect(getFileIconKind("draft.pdf.txt")).toBe("document");
  });

  it("reads a dotfile's name as its extension", () => {
    expect(getFileIconKind(".env")).toBe("data");
    expect(getFileIconKind(".gitignore")).toBe("other");
  });

  it("falls back to other for a name without a known extension", () => {
    expect(getFileIconKind("LICENSE")).toBe("other");
    expect(getFileIconKind("model.blend")).toBe("other");
    expect(getFileIconKind("trailing.")).toBe("other");
  });
});
