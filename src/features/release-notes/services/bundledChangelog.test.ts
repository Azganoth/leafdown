import { describe, expect, it } from "vitest";

import { getBundledChangelog, getReleaseNotesSection } from "./bundledChangelog";

const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Future change with **emphasis**.

## [1.2.0] - 2026-09-29

### Added

- Current release.

## [1.1.0] - 2026-01-01

- Older release.
`;

describe("bundled changelog", () => {
  it("selects only the exact running version in release builds", () => {
    expect(getReleaseNotesSection(CHANGELOG, "1.2.0", false)).toBe(
      "### Added\n\n- Current release.",
    );
    expect(getReleaseNotesSection(CHANGELOG, "1.2", false)).toBeNull();
    expect(getReleaseNotesSection(CHANGELOG, "1.3.0", false)).toBeNull();
  });

  it("uses Unreleased only for a development build without matching notes", () => {
    expect(getReleaseNotesSection(CHANGELOG, "1.3.0", true)).toContain("Future change");
    expect(getReleaseNotesSection(CHANGELOG, "1.2.0", true)).toContain("Current release");
  });

  it("rejects empty sections", () => {
    expect(getReleaseNotesSection("## [1.2.0]\n\n### Added\n", "1.2.0", false)).toBeNull();
  });

  it("bundles the repository changelog", () => {
    expect(getBundledChangelog()).toContain("# Changelog");
    expect(getBundledChangelog()).toContain("## [Unreleased]");
  });
});
