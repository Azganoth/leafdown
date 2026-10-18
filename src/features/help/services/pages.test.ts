import { describe, expect, it } from "vitest";

import { getHelpLinkTarget, getHelpPageSections, HELP_PAGES } from "./pages";

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

  it("resolves every authored guide and section link outside source examples", () => {
    for (const source of Object.values(HELP_PAGES)) {
      const sections = getHelpPageSections(source);
      let fence: string | undefined;
      for (const line of source.split(/\r?\n/u)) {
        const marker = /^(`{3,}|~{3,})/u.exec(line)?.[1];
        if (marker) {
          if (!fence) fence = marker;
          else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
          continue;
        }
        if (fence) continue;
        for (const match of line
          .replace(/`[^`]*`/gu, "")
          .matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/gu)) {
          const target = getHelpLinkTarget(match[1]);
          expect(target, match[1]).not.toBeNull();
          expect(target?.kind !== "section" || sections.some(({ id }) => id === target.id)).toBe(
            true,
          );
        }
      }
    }
  });

  it("routes a fragment to the section heading it names", () => {
    expect(getHelpLinkTarget("#work-in-more-than-one-window")).toEqual({
      kind: "section",
      id: "help-work-in-more-than-one-window",
    });
  });

  it("lists a page's sections, skipping headings inside fenced code", () => {
    const source = [
      "# Page",
      "",
      "## First `step`",
      "",
      "````text",
      "## Not a section",
      "```",
      "````",
      "",
      "## Second",
    ].join("\n");
    expect(getHelpPageSections(source)).toEqual([
      { id: "help-first-step", label: "First step" },
      { id: "help-second", label: "Second" },
    ]);
    expect(
      getHelpPageSections(HELP_PAGES["file-and-folder-workflows"]).map(({ id }) => id),
    ).toContain("help-work-in-more-than-one-window");
  });
});
