import { describe, expect, it } from "vitest";

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

const versions = (development: boolean) =>
  getReleaseNotesPages(CHANGELOG, development).map((page) => page.version);

describe("bundled changelog", () => {
  it("pages release sections newest first and skips sections without notes", () => {
    expect(versions(false)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
    expect(getReleaseNotesPages(CHANGELOG, false)[0]).toEqual({
      version: "1.2.0",
      date: new Date(2026, 8, 29),
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

  it("bundles the repository changelog", () => {
    expect(getBundledChangelog()).toContain("# Changelog");
    expect(getBundledChangelog()).toContain("## [Unreleased]");
    expect(getBundledReleaseNotesPages().map((page) => page.version)).toContain("0.1.0-alpha.1");
  });
});
