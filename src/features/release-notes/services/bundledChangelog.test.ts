import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getBundledChangelog,
  getBundledReleaseNotesPages,
  getCurrentReleaseNotesPage,
  getReleaseNotesPages,
} from "./bundledChangelog";

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Future change with **emphasis**.

## [1.2.0] - 2026-09-29

### Added

- Current release.

## [1.1.1] - 2026-03-01

### Fixed

## [1.1.0] - 2026-01-01

- Older release.

## [1.0.0]

- First release.
`;

const HIGHLIGHTED = `## [2.0.0] - 2026-10-20

### Highlights

#### Work in tabs

![](src/features/release-notes/highlights/tabs.svg)

Open several documents with \`Ctrl+T\`.

Each keeps its own history.

#### Missing drawing

![](./src/features/release-notes/highlights/missing.svg)

Still readable.

#### No drawing

Plain text.

### Added

- Tabs.

## [1.0.0]

### Highlights

#### Only highlights

Nothing else.
`;

const ILLUSTRATIONS = new Map([
  ["src/features/release-notes/highlights/tabs.svg", "<svg>tabs</svg>"],
]);

const versions = (development: boolean) =>
  getReleaseNotesPages(CHANGELOG, development).map((page) => page.version);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bundled changelog", () => {
  it("pages release sections newest first and skips sections without notes", () => {
    expect(versions(false)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
    expect(getReleaseNotesPages(CHANGELOG, false)[0]).toEqual({
      version: "1.2.0",
      date: new Date(2026, 8, 29),
      highlights: [],
      notes: "### Added\n\n- Current release.",
    });
    expect(getReleaseNotesPages(CHANGELOG, false).at(-1)?.date).toBeNull();
  });

  it("adds Unreleased as the newest page only in development builds", () => {
    expect(versions(true)).toEqual(["Unreleased", "1.2.0", "1.1.0", "1.0.0"]);
    expect(getReleaseNotesPages(CHANGELOG, true)[0]).toMatchObject({
      date: null,
      notes: expect.stringContaining("Future change"),
    });
    expect(versions(false)).not.toContain("Unreleased");
  });

  it("drops an Unreleased section without notes even in development", () => {
    expect(
      getReleaseNotesPages("## [Unreleased]\n\n### Added\n\n## [1.0.0]\n\n- One.\n", true).map(
        (page) => page.version,
      ),
    ).toEqual(["1.0.0"]);
  });

  it("selects the exact running version, falling back to Unreleased in development", () => {
    const release = getReleaseNotesPages(CHANGELOG, false);
    const development = getReleaseNotesPages(CHANGELOG, true);

    expect(getCurrentReleaseNotesPage(release, "1.2.0")?.version).toBe("1.2.0");
    expect(getCurrentReleaseNotesPage(release, "1.2")).toBeNull();
    expect(getCurrentReleaseNotesPage(release, "1.1.1")).toBeNull();
    expect(getCurrentReleaseNotesPage(release, "1.3.0")).toBeNull();
    expect(getCurrentReleaseNotesPage(development, "1.2.0")?.version).toBe("1.2.0");
    expect(getCurrentReleaseNotesPage(development, "1.3.0")?.version).toBe("Unreleased");
  });

  it("reads a release's highlights and keeps the rest of its section as notes", () => {
    const [release, highlightsOnly] = getReleaseNotesPages(HIGHLIGHTED, false, ILLUSTRATIONS);

    expect(release).toEqual({
      version: "2.0.0",
      date: new Date(2026, 9, 20),
      highlights: [
        {
          title: "Work in tabs",
          body: "Open several documents with `Ctrl+T`.\n\nEach keeps its own history.",
          illustration: "<svg>tabs</svg>",
        },
        { title: "Missing drawing", body: "Still readable.", illustration: null },
        { title: "No drawing", body: "Plain text.", illustration: null },
      ],
      notes: "### Added\n\n- Tabs.",
    });
    expect(highlightsOnly).toMatchObject({
      version: "1.0.0",
      highlights: [{ title: "Only highlights", body: "Nothing else." }],
      notes: "",
    });
  });

  it("bundles every illustration the repository changelog names", () => {
    vi.stubEnv("DEV", true);
    const named = getBundledChangelog().match(/^!\[[^\]]*\]\([^)]+\)$/gmu) ?? [];
    const illustrations = getBundledReleaseNotesPages()
      .flatMap((page) => page.highlights)
      .flatMap((highlight) => (highlight.illustration ? [highlight.illustration] : []));

    expect(named.length).toBeGreaterThan(0);
    expect(illustrations).toHaveLength(named.length);
    for (const illustration of illustrations) {
      expect(illustration).toMatch(/^<svg [^>]*viewBox="0 0 240 144"/u);
    }
  });

  it("bundles the repository changelog", () => {
    expect(getBundledChangelog()).toContain("# Changelog");
    expect(getBundledChangelog()).toContain("## [Unreleased]");
    expect(getBundledReleaseNotesPages().map((page) => page.version)).toContain("0.1.0-alpha.1");
  });
});
