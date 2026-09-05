// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

// Files a save writes back exactly as they were authored. Identity subsumes convergence,
// so these carry no convergence assertion.
const byteIdenticalFiles = [
  "commonmark/blocks.md",
  "commonmark/code.md",
  "commonmark/html.md",
  "commonmark/lists-and-blockquotes.md",
  "gfm/tagfilter.md",
  "gfm/task-lists.md",
  "isolated/end-of-file/incomplete-html-comment.md",
  "isolated/end-of-file/unclosed-code-fence.md",
  "isolated/end-of-file/unclosed-directive.md",
  "isolated/end-of-file/unclosed-html-block.md",
];

// Files a save still rewrites, each held short of identity by a form nothing in the
// document owns. `Preserve the form a file was written in` in `docs/decisions.md`
// settles every class named here, so a file leaves this list only with that record.
const convergingFiles = [
  // Nesting of one mark type collapses at the parse, which no serializer change reaches.
  "commonmark/emphasis.md",
  // An escape, which nothing durable records.
  "commonmark/links-and-images.md",
  // That same escape, whitespace a parse trims at a line edge, and a tab a container's
  // prefix covers and the parse expands against the tab stops.
  "commonmark/text-and-breaks.md",
  // A single-tilde run, which the preset's strikethrough mark holds no marker for.
  "gfm/autolinks.md",
  // That same run, and the escape kept where a mark's content spells the run beside it.
  "gfm/strikethrough.md",
  // Cell padding, a layout computed across a column no node owns.
  "gfm/tables.md",
];

const corpusFiles = [...byteIdenticalFiles, ...convergingFiles];

const readCorpusFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), "corpus", relativePath), "utf8");

describe("Corpus round trip", () => {
  beforeEach(() => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));
  });

  it.each(byteIdenticalFiles)("writes %s back as it was authored", async (relativePath) => {
    const source = readCorpusFile(relativePath);

    expect((await mountEditor(source)).getMarkdown()).toBe(source);
  });

  // The baseline is the first serialization rather than the file, because a save still
  // rewrites these on first open.
  it.each(convergingFiles)("converges on a stable serialization for %s", async (relativePath) => {
    const source = readCorpusFile(relativePath);

    const first = (await mountEditor(source)).getMarkdown();
    const second = (await mountEditor(first)).getMarkdown();

    expect(second).toBe(first);
  });

  it.each(corpusFiles)("preserves the document across a save for %s", async (relativePath) => {
    const before = await mountEditor(readCorpusFile(relativePath));
    const beforeDoc: unknown = before.view.state.doc.toJSON();

    const after = await mountEditor(before.getMarkdown());
    const afterDoc: unknown = after.view.state.doc.toJSON();

    expect(afterDoc).toEqual(beforeDoc);
  });
});
