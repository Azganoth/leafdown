/**
 * Generates the `sample/` directory at the project root.
 *
 * This directory is a self-contained manual testing workspace for Leafdown.
 * It is gitignored — run `pnpm sample` after cloning to create it.
 *
 * Each fixture targets a specific scanning, rendering, or error-handling
 * behavior described in the specification.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE = resolve(ROOT, "sample");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const write = (relativePath: string, content: string | Buffer) => {
  const absolute = resolve(SAMPLE, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
};

// ---------------------------------------------------------------------------
// Root-level index file
// Validates: auto-open index file on folder load, relative image rendering,
//            relative link navigation.
// ---------------------------------------------------------------------------

write(
  "readme.md",
  `# Leafdown Sample Workspace

This folder is a manual testing workspace for Leafdown. Open it with
**File → Open folder…** to exercise sidebar scanning, Markdown rendering,
and edge-case error states.

## Contents

- [Syntax Benchmark](./syntax-benchmark.md) — CommonMark and GFM rendering.
- [Nested Document](./nested-directory/doc-alternate.markdown) — Alternate
  \`.markdown\` extension support.
- \`.cache/\` — Contains a Markdown file inside an ignored directory.
- \`empty-directory/\` — A subfolder with no Markdown files.
- \`edge-cases/\` — Error and boundary condition fixtures.

## Relative Image

The image below uses a relative path and should render via the Tauri asset
protocol:

![Sample Icon](./assets/icon.png)
`,
);

// ---------------------------------------------------------------------------
// Syntax benchmark
// Validates: CommonMark and GFM element rendering, heading hierarchy,
//            list types, blockquotes, code blocks, tables, inline formatting,
//            horizontal rules, footnotes, and HTML sanitization.
// ---------------------------------------------------------------------------

write(
  "syntax-benchmark.md",
  `# Syntax Benchmark

A comprehensive rendering test for CommonMark and GFM elements.

## Headings

### Third-Level Heading

#### Fourth-Level Heading

##### Fifth-Level Heading

###### Sixth-Level Heading

## Paragraphs

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque
habitant morbi tristique senectus et netus et malesuada fames ac turpis
egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit
amet, ante.

A second paragraph separated by a blank line to verify paragraph splitting.

## Emphasis and Strong

- *Single asterisk emphasis*
- _Single underscore emphasis_
- **Double asterisk strong**
- __Double underscore strong__
- ***Bold and italic***
- ~~Strikethrough~~

## Links

- [Relative link to readme](./readme.md)
- [External link](https://github.com/Azganoth/leafdown)
- [**Formatted link text**](./readme.md)
- Autolink: https://example.com

## Images

![Sample Icon](./assets/icon.png)

## Inline Code

Use \`const x = 42;\` for inline code. Backtick escaping: \`\`\`nested\`\`\`.

## Code Blocks

\`\`\`typescript
const greet = (name: string): string => {
  return \\\`Hello, \\\${name}!\\\`;
};

console.log(greet("Leafdown"));
\`\`\`

\`\`\`
Plain code block without a language identifier.
\`\`\`

## Blockquotes

> A single-level blockquote.
>
> > A nested blockquote.
>
> Back to the first level.

## Lists

### Unordered

- Item 1
- Item 2
  - Nested 2a
  - Nested 2b
- Item 3

### Ordered

1. First
2. Second
   1. Nested 2a
   2. Nested 2b
3. Third

### Task List

- [x] Completed task
- [ ] Incomplete task
- [ ] Task with *inline emphasis*

## Tables

| Name    | Role      | Extension    |
| :------ | :-------: | -----------: |
| Alice   | Developer | .md          |
| Bob     | Tester    | .markdown    |
| Charlie | Designer  | .md          |

## Horizontal Rules

---

***

___

## Footnotes

Here is a sentence with a footnote[^1].

[^1]: This is the footnote content.

## HTML Sanitization

Raw HTML should be escaped and rendered as code-like text, not parsed as DOM:

<div>This div tag should appear as plain text.</div>
<script>alert("XSS should be blocked")</script>
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

- [x] Scanned by the file tree
- [x] Opened in the editor
- [ ] Saved with modifications
`,
);

// ---------------------------------------------------------------------------
// Non-Markdown file (should be filtered from sidebar)
// Validates: file tree filters non-Markdown files.
// ---------------------------------------------------------------------------

write(
  "nested-directory/notes.txt",
  `This is a plain text file.

It should NOT appear in Leafdown's sidebar. The file tree only displays
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

// ---------------------------------------------------------------------------
// Edge case: mixed line endings (3 LF, 2 CRLF → majority LF)
// Validates: majority-vote line ending detection.
// ---------------------------------------------------------------------------

write(
  "edge-cases/mixed-endings.md",
  "# Mixed Line Endings\n" +
    "\n" +
    "This file contains 3 LF and 2 CRLF line endings.\r\n" +
    "The majority-vote algorithm should detect LF as the dominant ending.\n" +
    "\r\n" +
    "— End of file.\n",
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

console.log(`✔ Sample workspace generated at: ${SAMPLE}`);
