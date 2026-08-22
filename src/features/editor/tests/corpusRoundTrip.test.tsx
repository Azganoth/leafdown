import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

const corpusFiles = [
  "commonmark/blocks.md",
  "commonmark/code.md",
  "commonmark/emphasis.md",
  "commonmark/html.md",
  "commonmark/links-and-images.md",
  "commonmark/lists-and-blockquotes.md",
  "commonmark/text-and-breaks.md",
  "gfm/autolinks.md",
  "gfm/strikethrough.md",
  "gfm/tables.md",
  "gfm/tagfilter.md",
  "gfm/task-lists.md",
  "isolated/end-of-file/incomplete-html-comment.md",
  "isolated/end-of-file/unclosed-code-fence.md",
  "isolated/end-of-file/unclosed-directive.md",
  "isolated/end-of-file/unclosed-html-block.md",
];

const documentDrift: Record<string, string> = {
  "commonmark/blocks.md": "tight bullet lists saved loose",
  "commonmark/html.md": "line break before an HTML block lost",
  "commonmark/lists-and-blockquotes.md": "tight bullet lists saved loose",
  "gfm/tables.md": "ragged table row padded into new cells",
  "gfm/task-lists.md": "tight bullet lists saved loose",
};

const readCorpusFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), "corpus", relativePath), "utf8");

const saveAndReopen = async (relativePath: string) => {
  const before = await mountEditor(readCorpusFile(relativePath));
  const beforeDoc: unknown = before.view.state.doc.toJSON();

  const after = await mountEditor(before.getMarkdown());
  const afterDoc: unknown = after.view.state.doc.toJSON();

  return [beforeDoc, afterDoc];
};

// The editor is allowed to normalize on first open, so the baseline is the first
// serialization rather than the corpus file.
describe("Corpus round trip", () => {
  beforeEach(() => {
    mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
      kind: "renderable",
      path: `C:/Notes/${target}`,
    }));
  });

  it.each(corpusFiles)("converges on a stable serialization for %s", async (relativePath) => {
    const source = readCorpusFile(relativePath);

    const first = (await mountEditor(source)).getMarkdown();
    const second = (await mountEditor(first)).getMarkdown();

    expect(second).toBe(first);
  });

  it.each(corpusFiles.filter((relativePath) => !(relativePath in documentDrift)))(
    "preserves the document across a save for %s",
    async (relativePath) => {
      const [beforeDoc, afterDoc] = await saveAndReopen(relativePath);

      expect(afterDoc).toEqual(beforeDoc);
    },
  );

  it.each(Object.keys(documentDrift))("still drifts across a save for %s", async (relativePath) => {
    const [beforeDoc, afterDoc] = await saveAndReopen(relativePath);

    expect(afterDoc).not.toEqual(beforeDoc);
  });
});
