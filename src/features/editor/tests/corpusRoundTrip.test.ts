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
  "commonmark/html.md",
  "gfm/tagfilter.md",
  "isolated/end-of-file/incomplete-html-comment.md",
  "isolated/end-of-file/unclosed-directive.md",
  "isolated/end-of-file/unclosed-html-block.md",
];

// Files a save still rewrites, either through a class not yet removed or through a form
// nothing owns. This list ends holding only the second kind.
const convergingFiles = [
  "commonmark/blocks.md",
  "commonmark/code.md",
  "commonmark/emphasis.md",
  "commonmark/links-and-images.md",
  "commonmark/lists-and-blockquotes.md",
  "commonmark/text-and-breaks.md",
  "gfm/autolinks.md",
  "gfm/strikethrough.md",
  "gfm/tables.md",
  "gfm/task-lists.md",
  "isolated/end-of-file/unclosed-code-fence.md",
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
