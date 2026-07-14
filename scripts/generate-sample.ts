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
import { deflateSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = resolve(ROOT, "sample");
const SORT_OLDER_MODIFIED_AT = new Date("2026-01-10T10:00:00.000Z");
const SORT_NEWER_MODIFIED_AT = new Date("2026-06-10T10:00:00.000Z");
const PNG_WIDTH = 96;
const PNG_HEIGHT = 64;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  return value >>> 0;
});

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

const getCrc32 = (content: Buffer) => {
  let value = 0xffffffff;

  for (const byte of content) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
};

const createPngChunk = (type: string, content: Buffer) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);

  length.writeUInt32BE(content.length);
  checksum.writeUInt32BE(getCrc32(Buffer.concat([typeBuffer, content])));

  return Buffer.concat([length, typeBuffer, content, checksum]);
};

const createSamplePng = () => {
  const pixels = Buffer.alloc((PNG_WIDTH * 4 + 1) * PNG_HEIGHT);

  for (let y = 0; y < PNG_HEIGHT; y += 1) {
    const rowOffset = y * (PNG_WIDTH * 4 + 1);
    pixels[rowOffset] = 0;

    for (let x = 0; x < PNG_WIDTH; x += 1) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const leaf = (x - 48) ** 2 / 1_500 + (y - 31) ** 2 / 650 < 1;
      const vein = Math.abs(y - (46 - x / 3)) < 2;

      pixels[pixelOffset] = leaf ? 183 : 32;
      pixels[pixelOffset + 1] = leaf ? (vein ? 212 : 190) : 36;
      pixels[pixelOffset + 2] = leaf ? (vein ? 106 : 88) : 21;
      pixels[pixelOffset + 3] = 255;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(PNG_WIDTH, 0);
  header.writeUInt32BE(PNG_HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    createPngChunk("IHDR", header),
    createPngChunk("IDAT", deflateSync(pixels)),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
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
- [São Paulo field notes](./nested-directory/field-notes%20%E2%80%93%20s%C3%A3o-paulo.md)
  exercise a Unicode article path.
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
  `# Community Garden Notes

This overview uses an uppercase \`.MD\` extension and introduces the planning
notes collected for the garden pilot.

## Folder map

- The \`02-drafts/\` folder holds dated working notes.
- \`empty-section/\` is reserved for a future workstream.
- The \`sort-order/\` folders keep a stable set of chapters and dated records
  for comparing navigator ordering.
`,
);

write(
  "article-navigator/01-overview.md",
  `# Garden Pilot Overview

The pilot combines daily sensor readings with a short volunteer walk-through.
The team uses this overview to connect the working notes without turning the
folder into a separate project-management system.

## Reading summary

- [Community garden notes](./README.MD) explain the folder structure.
- [Session notes](./02-drafts/2026-05-12-session-notes.md) record the latest
  choices from the field visit.
`,
);

write(
  "article-navigator/02-drafts/2026-05-12-session-notes.md",
  `# Tuesday Session Notes

## Decisions

- Move the north-bed probe before changing the watering schedule.
- Keep the reading notes small enough for volunteers to review on site.

## Follow-ups

- [ ] Photograph the new mounting point.
- [ ] Add the battery estimate to the next field report.
`,
);

write(
  "article-navigator/02-drafts/2026-05-13-retrospective.markdown",
  `# Drafting Retrospective

The first set of notes was easy to scan because the decisions stayed close to
the observations. The next draft should keep that rhythm and include the final
manual-gauge reading before the team changes the schedule.
`,
);

write("article-navigator/empty-section/.gitkeep", "");
write("article-navigator/sort-order/by-type/chapter/.gitkeep", "");
write(
  "article-navigator/index-precedence/readme.md",
  `# Preferred Folder Note

This \`readme.md\` should open first when this folder is opened directly.
`,
);
write(
  "article-navigator/index-precedence/readme.markdown",
  `# Alternate README

This file shares the preferred base name but uses the secondary extension.
`,
);
write(
  "article-navigator/index-precedence/index.md",
  `# Index Fallback

This file remains available when no configured README file is present.
`,
);
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
  `# Asset Handoff

The garden team keeps its handoff material together so the next volunteer can
open the notes, inspect the map, and identify anything that still needs a local
file or a safer destination.

## Reading material

- The [field overview](./article-navigator/01-overview.md?mode=edit#reading-summary)
  and [decision record](./nested-directory/doc-alternate.markdown) are local
  Markdown notes.
- The original [reference attachment](./assets/reference.txt) is a local
  non-Markdown file.
- The [missing handoff note](./missing-document.md) is intentionally absent.
- The [contact address](mailto:test@example.com) and [legacy script
  link](javascript:alert) are included as unsupported destination examples.

## Shared images

The printable marker uses a PNG path with spaces:

![Garden marker](<./assets/icon with spaces (v1).png>)

The project logo is an SVG:

![Leafdown sample logo](./assets/leafdown-logo.svg)

The following references intentionally remain unavailable or blocked:

- ![Missing map](<./assets/missing image.png>)
- ![Remote image](https://example.com/image.png)
- ![Protocol-relative image](//example.com/image.png)
- ![Unsupported bitmap](./assets/unsupported.bmp)
`,
);

// ---------------------------------------------------------------------------
// Research format notes
// Validates: planned Markdown-extension candidates remain editable and do not
//            crash the MVP editor before first-class support exists.
// ---------------------------------------------------------------------------

write(
  "research-format-notes.md",
  `---
title: Field Research Format Notes
tags:
  - garden-pilot
  - research
---

# Field Research Format Notes

The pilot's research log collects useful notation before the team agrees on a
long-term publishing format. Leafdown should keep these notes readable and
editable even where it does not yet attach special meaning to the syntax.

## Observation callout

> [!NOTE]
> The north-bed reading should be compared with the afternoon manual gauge.

## Cross-reference

The historical record is kept in [[Community Garden Sensor Pilot]] until the
team chooses a wiki-link convention.

## Sources and terms

Research notes cite [@doe2026; @roe2024] while the bibliography is still being
assembled.

Calibration
: Comparing a probe with a trusted manual measurement.

## Working formulas

The quick estimate uses $E = mc^2$ only as a placeholder for a future formula
workflow:

$$
\\int_0^1 x^2 dx = \\frac{1}{3}
$$

## Diagram draft

\`\`\`mermaid
graph TD
  A[Read sensor] --> B[Compare manual gauge]
  B --> C[Plan watering]
\`\`\`

:::note
The team will keep this directive-style reminder in the draft for now.
:::
`,
);

// ---------------------------------------------------------------------------
// Alternate extension
// Validates: .markdown extension scanning and editing.
// ---------------------------------------------------------------------------

write(
  "nested-directory/doc-alternate.markdown",
  `# Probe Placement Decision

The field team will move the north-bed probe to the shaded fence post before
changing the watering schedule. This note uses the \`.markdown\` extension so
the folder contains both supported Markdown file types.

## Record

- Keep the original reading in the weekly report.
- Add the new location to the [São Paulo field notes](./field-notes – são-paulo.md).
- Review the placement after the next dry afternoon.
`,
);

write(
  "nested-directory/field-notes – são-paulo.md",
  `# São Paulo Field Notes

The visiting team compared the shaded and sunny beds before lunch. The north
probe will move once the fence-post bracket arrives.
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
// Asset images
// Validates: relative image path resolution via Tauri's asset protocol,
//            proper URL-encoding of the path, and Windows backslash
//            normalization. The PNG is visible enough for manual inspection.
// ---------------------------------------------------------------------------

const SAMPLE_PNG = createSamplePng();
write("assets/icon.png", SAMPLE_PNG);
write("assets/icon with spaces (v1).png", SAMPLE_PNG);

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
// Edge case: heading hierarchy
// Validates: the full supported heading range without making everyday documents
//            carry an artificial deep outline.
// ---------------------------------------------------------------------------

write(
  "edge-cases/heading-depths.md",
  `# Garden Archive

## Seasonal program

### Sensor pilot

#### Calibration procedure

##### Rain-day exception

###### Source reading

The archive keeps this narrow outline for typography and structural checks.
`,
);

// ---------------------------------------------------------------------------
// Edge case: raw HTML safety
// Validates: complete inline and block HTML-like source is preserved as text
//            rather than interpreted as browser DOM.
// ---------------------------------------------------------------------------

write(
  "edge-cases/html-as-text.md",
  `# Imported HTML Notes

The following fragment came from a supplier handoff and should remain visible as
text rather than changing the editor layout:

<div class="reading"><span>31%</span></div>

<script>alert("This must not execute")</script>
`,
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

## Image

The image below points outside the folder context and should render as an
inline confirmation placeholder instead of loading automatically:

![Outside Icon](../../src-tauri/icons/128x128.png)
`,
);

// ---------------------------------------------------------------------------

console.log(`✔ Sample folder generated at: ${SAMPLE}`);
