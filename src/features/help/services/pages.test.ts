import { describe, expect, it } from "vitest";

import { getHelpLinkTarget, HELP_PAGES } from "./pages";

describe("bundled Help pages", () => {
  it("ships a nonempty document for every page", () => {
    expect(Object.keys(HELP_PAGES)).toEqual([
      "getting-started",
      "markdown-reference",
      "file-and-folder-workflows",
      "settings-reference",
    ]);
    for (const page of Object.values(HELP_PAGES)) {
      expect(page).toMatch(/^# .+\n/u);
    }
  });

  it("keeps authored extension examples as valid multiline source", () => {
    const reference = HELP_PAGES["markdown-reference"];
    expect(reference).toMatch(/Term\r?\n: Its definition\./u);
    expect(reference).toMatch(/> \[!NOTE\]\r?\n> Keep a copy/u);
    expect(reference).toMatch(/!!! warning "Before you save"\r?\n    Check changes/u);
    expect(reference).toMatch(/::: tip\r?\nKeep related articles in one folder\.\r?\n:::/u);
  });

  it("routes only known bundled pages and explicit web URLs", () => {
    expect(getHelpLinkTarget("./settings-reference.md")).toEqual({
      kind: "internal",
      page: "settings-reference",
    });
    expect(getHelpLinkTarget("markdown-reference.md")).toEqual({
      kind: "internal",
      page: "markdown-reference",
    });
    expect(getHelpLinkTarget("https://example.com/guide")).toEqual({
      kind: "external",
      url: "https://example.com/guide",
    });
    for (const href of [
      "../specification.md",
      "missing.md",
      "//example.com",
      "file:///C:/private.txt",
      "javascript:alert(1)",
      "https://user:secret@example.com/guide",
    ]) {
      expect(getHelpLinkTarget(href)).toBeNull();
    }
  });
});
