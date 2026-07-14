/**
 * Generates the `sample/` directory at the project root.
 *
 * This directory is a self-contained manual testing folder for Leafdown.
 * It is gitignored — run `pnpm sample` after cloning to create it.
 * Regeneration replaces the previous `sample/` contents.
 *
 * Each fixture targets a specific scanning, rendering, or error-handling
 * behavior described in the specification.
 */

import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = resolve(ROOT, "sample");
const SORT_OLDER_MODIFIED_AT = new Date("2026-01-10T10:00:00.000Z");
const SORT_NEWER_MODIFIED_AT = new Date("2026-06-10T10:00:00.000Z");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const write = (relativePath: string, content: string | Buffer) => {
  const absolute = resolve(SAMPLE, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);

  return absolute;
};

const writeWithModifiedAt = (relativePath: string, content: string | Buffer, modifiedAt: Date) => {
  const absolute = write(relativePath, content);

  utimesSync(absolute, modifiedAt, modifiedAt);
};

rmSync(SAMPLE, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Root-level index file
// Validates: auto-open index file on folder load, relative image rendering,
//            relative link navigation.
// ---------------------------------------------------------------------------

write(
  "readme.md",
  `# Leafdown Sample Folder

Welcome to a small working set for Leafdown. Open it with
**File → Open folder…** to browse a realistic collection of notes while also
exercising navigation, rendering, and deliberately focused edge cases.

## Contents

- [Garden pilot field report](./field-report.md) collects the week's findings,
  decisions, and next steps.
- [Release review notes](./editor-regression-notes.md) are a compact working
  document for rich inline editing and save/reopen checks.
- [Article navigator](./article-navigator/README.MD) contains the project's
  nested planning notes and sorting fixtures.
- [Media and links](./media-and-links.md) records the assets shared with the
  team, including intentionally unavailable references.
- [Research format notes](./research-format-notes.md) keeps future Markdown
  ideas readable before Leafdown supports them natively.
- [Alternate extension document](./nested-directory/doc-alternate.markdown)
  uses \`.markdown\` instead of \`.md\`.
- \`.cache/\` and \`node_modules/\` contain intentionally ignored articles.
- \`empty-directory/\` contains no articles.
- \`edge-cases/\` holds focused loading, safety, and boundary fixtures.

## Relative Image

The image below uses a relative path and should render via the Tauri asset
protocol:

![Sample Icon](./assets/icon.png)
`,
);

// ---------------------------------------------------------------------------
// Field report
// Validates: ordinary CommonMark and GFM rendering in coherent prose: headings,
//            lists, blockquotes, code, tables, links, images, and footnotes.
// ---------------------------------------------------------------------------

write(
  "field-report.md",
  `# Community Garden Sensor Pilot

## Week 4 field report

The south-bed sensors held their target range through the first dry week. A
_temporary_ watering schedule became **necessary** only after the evening
readings drifted, and the ***calibration review*** confirmed that the probes
were still healthy.[^calibration]

The team used [the **sensor calibration** *review* notes](./article-navigator/01-overview.md "Calibration review")
to compare the new probes with the earlier manual readings. The old estimate is
now ~~superseded~~, while the command \`pnpm sample\` remains the quickest way
to rebuild this folder before a walkthrough.

> “The readings are useful when they tell us when _not_ to water.”
>
> — Mara, garden volunteer

### What changed

1. Reposition the north-bed probe before the next rain.
2. Publish the short calibration note for the volunteer team.
3. Review the replacement-battery estimate with the coordinator.

- [x] Record the first week of readings.
- [x] Compare the new probe against the manual gauge.
- [ ] Move the north-bed probe.
  - [ ] Photograph the mounting point.
  - [ ] Add the final location to the map.
- [ ] Share the next watering window with volunteers.

### Reading summary

| Bed | Latest reading | Working interpretation |
| :-- | :------------: | ---------------------- |
| North | \`31%\` | Reposition the probe before changing the schedule. |
| South | \`42%\` | Keep the current plan through Friday. |
| Herbs | \`38%\` | Ask for one more manual reading. |

### Implementation note

The import script keeps each reading as a small record so the team can inspect
it without opening a spreadsheet:

\`\`\`typescript
interface Reading {
  bed: string;
  moisture: number;
}

const needsFollowUp = ({ moisture }: Reading) => moisture < 35;

console.log(needsFollowUp({ bed: "North", moisture: 31 }));
\`\`\`

![Garden sensor map](./assets/icon.png)

---

## Next visit

The next visit is scheduled for Tuesday morning. The team will bring one spare
battery, the printed layout, and the notes from the [first field
walk](./nested-directory/doc-alternate.markdown).

[^calibration]: The south-bed probe was checked against the manual gauge at
    08:30. The readings differed by less than two percentage points.
`,
);

// ---------------------------------------------------------------------------
// Editor regression notes
// Validates: realistic source-projection and serialization seeds: mixed logical
//            links, nested marks, code-span delimiter runs, autolinks,
//            footnotes, and formatting around an atomic reference.
// ---------------------------------------------------------------------------

write(
  "editor-regression-notes.md",
  `# Release Review Notes

## Copy review

The [**calibration summary** with *field observations*, ~~retired wording~~,
and \`v2\`](./article-navigator/01-overview.md "Calibration review") should
remain one link when it is edited and saved. Its label also keeps a literal
\\* marker for the copy editor to preserve.

The guide points readers to <https://example.com/releases/2026-06>, while the
draft recommendation is _deliberate_ rather than __final__. Use
\`\`pnpm run \`preview\`\`\` when checking the local walkthrough; the nested
backtick is part of the command shown to reviewers.

## Editorial decision

The **archive note[^archive]** stays with the approved wording, and the
*follow-up reference[^follow-up]* remains with the scheduling sentence. Those
references belong to the document text rather than to a separate form.

When the paragraph is revised, select only **one phrase** before applying a
format command, then undo and redo the change. A line break in the middle of
the emphasized recommendation should continue as ordinary editor behavior.

[^archive]: The original calibration record is retained for the release notes.
[^follow-up]: The scheduling decision is reviewed after the Tuesday visit.
`,
);

// ---------------------------------------------------------------------------
// Article navigator fixtures
// Validates: nested directory scanning, uppercase supported extensions, empty
//            directory display, and name/type/modified-date sorting.
// ---------------------------------------------------------------------------

write(
  "article-navigator/README.MD",
  `# Article Navigator Fixture

This file uses an uppercase \`.MD\` extension. It should appear in the article
navigator and open like any other article.

## Manual Checks

- Expand this folder and confirm nested articles are visible.
- Confirm \`empty-section/\` is visible even though it has no articles.
- Switch article sorting between Name, Modified date, and Type.
- In \`sort-order/by-type/\`, directories should sort before articles when
  sorting by Type.
- In \`sort-order/by-modified-date/\`, \`newer.md\` should sort before
  \`older.md\` when sorting by Modified date.
`,
);

write(
  "article-navigator/01-overview.md",
  `# Article Navigator Overview

This article gives the navigator a short, normal Markdown document that is safe
to open while testing folder expansion, collapse, selection, and sidebar
refreshes.

## Links

- [Sibling uppercase article](./README.MD)
- [Nested session notes](./02-drafts/2026-05-12-session-notes.md)
`,
);

write(
  "article-navigator/02-drafts/2026-05-12-session-notes.md",
  `# Session Notes

## Decisions

- Keep manual fixtures readable as ordinary user documents.
- Prefer small targeted files over one enormous fixture for sidebar testing.

## Follow-ups

- [ ] Rename a file outside Leafdown and confirm the watcher refreshes.
- [ ] Add a new Markdown file outside Leafdown and confirm it appears.
`,
);

write(
  "article-navigator/02-drafts/2026-05-13-retrospective.markdown",
  `# Retrospective

This nested article uses the \`.markdown\` extension so the article navigator
contains both supported Markdown extensions at multiple depths.
`,
);

write("article-navigator/empty-section/.gitkeep", "");
write("article-navigator/sort-order/by-type/chapter/.gitkeep", "");
write(
  "article-navigator/sort-order/by-type/alpha.markdown",
  `# Alpha Markdown Article

Used with \`zeta.md\` and \`chapter/\` to verify Type sorting inside a nested
directory.
`,
);
write(
  "article-navigator/sort-order/by-type/zeta.md",
  `# Zeta Markdown Article

Used with \`alpha.markdown\` and \`chapter/\` to verify Type sorting inside a
nested directory.
`,
);
writeWithModifiedAt(
  "article-navigator/sort-order/by-modified-date/older.md",
  `# Older Modified-Date Article

This file has an intentionally older modified timestamp.
`,
  SORT_OLDER_MODIFIED_AT,
);
writeWithModifiedAt(
  "article-navigator/sort-order/by-modified-date/newer.md",
  `# Newer Modified-Date Article

This file has an intentionally newer modified timestamp.
`,
  SORT_NEWER_MODIFIED_AT,
);

// ---------------------------------------------------------------------------
// Media and link fixtures
// Validates: local Markdown navigation, local non-Markdown target handling,
//            missing targets, blocked remote images, unsupported targets,
//            SVG rendering, and special-character image paths.
// ---------------------------------------------------------------------------

write(
  "media-and-links.md",
  `# Media and Links

This article groups link and image cases that are easier to verify in a focused
document than inside the syntax benchmark.

## Links

- [Relative Markdown link with query and fragment](./article-navigator/01-overview.md?mode=edit#manual-checks)
- [Nested Markdown article](./nested-directory/doc-alternate.markdown)
- [Local non-Markdown file](./assets/reference.txt)
- [Missing Markdown article](./missing-document.md)
- [Unsupported mail link](mailto:test@example.com)
- [Unsafe JavaScript link](javascript:alert)

## Images

![PNG with spaces](<./assets/icon with spaces (v1).png>)

![SVG logo](./assets/leafdown-logo.svg)

![Missing image](<./assets/missing image.png>)

![Remote blocked](https://example.com/image.png)

![Protocol-relative remote blocked](//example.com/image.png)

![Unsupported bitmap](./assets/unsupported.bmp)
`,
);

// ---------------------------------------------------------------------------
// Future syntax preservation
// Validates: planned Markdown-extension candidates remain editable and do not
//            crash the MVP editor before first-class support exists.
// ---------------------------------------------------------------------------

write(
  "future-syntax-preservation.md",
  `---
title: Future Syntax Preservation
tags:
  - leafdown
  - testing
---

# Future Syntax Preservation

This article collects syntax candidates from the backlog. Today, Leafdown should
keep the content editable and avoid crashes. Later, this same file can become a
manual regression fixture for first-class extension support.

## Callout Candidate

> [!NOTE]
> This should behave like a normal blockquote until callouts are supported.

## Wiki Link Candidate

Keep [[Article Navigator Fixture]] readable as ordinary text until wiki links
are supported.

## Citation Candidate

Research notes can reference [@doe2026; @roe2024] without requiring a citation
engine yet.

## Definition List Candidate

Term
: A definition that should stay editable before definition lists are supported.

## Math Candidate

Inline math $E = mc^2$ and block math:

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

## Mermaid Candidate

\`\`\`mermaid
graph TD
  A[Open folder] --> B[Scan articles]
  B --> C[Open index article]
\`\`\`

## Directive Candidate

:::note
Directive-style content should remain visible and editable.
:::
`,
);

// ---------------------------------------------------------------------------
// Alternate extension
// Validates: .markdown extension scanning and editing.
// ---------------------------------------------------------------------------

write(
  "nested-directory/doc-alternate.markdown",
  `# Alternate Extension Document

This file uses the \`.markdown\` extension instead of \`.md\`.

Leafdown treats both extensions identically — this file should appear in the
sidebar and be fully editable.

## Checklist

- [x] Scanned into the article navigator
- [x] Opened in the editor
- [ ] Saved with modifications
`,
);

// ---------------------------------------------------------------------------
// Non-Markdown file (should be filtered from sidebar)
// Validates: the article navigator filters non-Markdown files.
// ---------------------------------------------------------------------------

write(
  "nested-directory/notes.txt",
  `This is a plain text file.

It should NOT appear in Leafdown's sidebar. The article navigator only displays
.md and .markdown files.
`,
);

// ---------------------------------------------------------------------------
// Ignored directory fixture
// Validates: .cache is in the default ignored directories list and its
//            contents are recursively skipped during folder scans.
// ---------------------------------------------------------------------------

write(
  ".cache/hidden-doc.md",
  `# Hidden Document

This file lives inside \`.cache/\`, which is on Leafdown's default ignored
directory list.

Neither this file nor the \`.cache/\` folder should appear in the sidebar.
`,
);

write(
  "node_modules/hidden-dependency.md",
  `# Hidden Dependency Document

This file lives inside \`node_modules/\`, which is also on Leafdown's default
ignored directory list.

Neither this file nor \`node_modules/\` should appear in the sidebar.
`,
);

// ---------------------------------------------------------------------------
// Empty directory (no Markdown files)
// Validates: subfolders with no supported files render correctly in the tree,
//            and the empty-folder-context state when opened directly.
// ---------------------------------------------------------------------------

write("empty-directory/.gitkeep", "");

// ---------------------------------------------------------------------------
// Asset image (1×1 transparent PNG)
// Validates: relative image path resolution via Tauri's asset protocol,
//            proper URL-encoding of the path, and Windows backslash
//            normalization.
// ---------------------------------------------------------------------------

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4" +
    "2mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
write("assets/icon.png", TRANSPARENT_PNG);
write("assets/icon with spaces (v1).png", TRANSPARENT_PNG);

write(
  "assets/leafdown-logo.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Leafdown sample logo">
  <rect width="96" height="96" rx="16" fill="#202415" />
  <path d="M22 54c20-34 50-34 56-34-1 30-20 54-54 54 6-8 14-15 27-25-12 4-21 10-29 5Z" fill="#b7d46a" />
  <path d="M24 74c10-18 24-31 46-44" fill="none" stroke="#f4f1df" stroke-width="5" stroke-linecap="round" />
</svg>
`,
);

write(
  "assets/reference.txt",
  "This text file is a local non-Markdown link target for opener testing.\n",
);
write("assets/unsupported.bmp", Buffer.from("BMunsupported-format-fixture"));

// ---------------------------------------------------------------------------
// Edge case: mixed line endings with LF majority
// Validates: majority-vote line ending detection.
// ---------------------------------------------------------------------------

write(
  "edge-cases/mixed-endings.md",
  "# Mixed Line Endings\n" +
    "\n" +
    "This file intentionally mixes LF and CRLF line endings.\r\n" +
    "The majority-vote algorithm should detect LF as the dominant ending.\n" +
    "\r\n" +
    "— End of file.\n",
);

// ---------------------------------------------------------------------------
// Edge case: mixed line endings with CRLF majority
// Validates: majority-vote line ending detection for Windows-style files.
// ---------------------------------------------------------------------------

write(
  "edge-cases/crlf-majority.md",
  "# CRLF-Majority Line Endings\r\n" +
    "\r\n" +
    "This file intentionally mixes CRLF and LF line endings.\r\n" +
    "The majority-vote algorithm should detect CRLF as the dominant ending.\n" +
    "Save should keep the selected CRLF output when unchanged.\r\n",
);

// ---------------------------------------------------------------------------
// Edge case: empty Markdown file
// Validates: empty files open as editable documents.
// ---------------------------------------------------------------------------

write("edge-cases/empty-document.md", "");

// ---------------------------------------------------------------------------
// Edge case: no final newline
// Validates: open/save behavior for files that do not end with a newline.
// ---------------------------------------------------------------------------

write(
  "edge-cases/no-final-newline.md",
  "# No Final Newline\n\nThis file intentionally does not end with a newline.",
);

// ---------------------------------------------------------------------------
// Edge case: malformed Markdown
// Validates: unusual or invalid Markdown does not crash the editor.
// ---------------------------------------------------------------------------

write(
  "edge-cases/malformed-markdown.md",
  `# Malformed Markdown

[Unterminated link](

![Unterminated image](

| A | B
| --- |
| one

<custom broken

::note{title="Unsupported"}

[^missing
`,
);

// ---------------------------------------------------------------------------
// Edge case: invalid UTF-8 bytes
// Validates: encoding detection rejects the file with a clear error message.
// ---------------------------------------------------------------------------

write("edge-cases/invalid-encoding.md", Buffer.from([0x80, 0x81, 0xfe, 0xff]));

// ---------------------------------------------------------------------------
// Edge case: oversized file (> 5 MB)
// Validates: loading limit error — files larger than 5 MB must not load.
// ---------------------------------------------------------------------------

const FIVE_MB = 5 * 1024 * 1024;
const header = "# Oversized Document\n\nThis file exceeds the 5 MB loading limit.\n\n";
const padding = "A".repeat(FIVE_MB - header.length + 1024); // ~5 MB + 1 KB
write("edge-cases/large-document.md", header + padding);

// ---------------------------------------------------------------------------
// Edge case: references outside the folder context
// Validates: link confirmation dialogs and inline image placeholder when
//            paths resolve outside the current folder context.
// ---------------------------------------------------------------------------

write(
  "edge-cases/outside-ref.md",
  `# Outside-Context References

This file contains links and images that resolve outside the \`sample/\`
folder context. Leafdown should prompt for confirmation before following or
rendering them.

## Links

- [Project Specification](../../docs/specification.md) — resolves to
  \`docs/specification.md\` outside \`sample/\`.
- [Absolute root](file:///C:/) — points to the C drive root.

## Image

The image below points outside the folder context and should render as an
inline confirmation placeholder instead of loading automatically:

![Outside Icon](../../src-tauri/icons/128x128.png)
`,
);

// ---------------------------------------------------------------------------

console.log(`✔ Sample folder generated at: ${SAMPLE}`);
