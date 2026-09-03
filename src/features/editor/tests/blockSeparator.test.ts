// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import { runEditorCommand } from "../commands";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

const TABLE = "| a | b |\n| - | - |\n| 1 | 2 |\n";

// Dropping a separator is the direction that merges two blocks, so every pairing is checked
// against the document it reopens as rather than against the bytes alone.
const expectSaved = async (source: string, expected: string) => {
  const before = await mountEditor(source);
  const beforeDocument: unknown = before.view.state.doc.toJSON();
  const written = before.getMarkdown();

  expect(written).toBe(expected);

  const after = await mountEditor(written);

  expect(after.view.state.doc.toJSON()).toEqual(beforeDocument);
};

const expectUnchanged = (source: string) => expectSaved(source, source);

describe("Block separator", () => {
  describe("keeps two blocks the file wrote adjacent", () => {
    it.each([
      {
        name: "a paragraph and the block-level tag after it",
        source: 'Text before.\n<section class="garden">\ncontent\n</section>\n',
      },
      { name: "two reference definitions", source: "[same]: /first\n[same]: /second\n" },
      { name: "a paragraph and the break that interrupts it", source: "A paragraph.\n***\n" },
      { name: "two headings", source: "# One\n## Two\n" },
      {
        name: "a quoted paragraph and a heading outside the quote",
        source: "> Quoted.\n# Heading\n",
      },
      { name: "a quoted paragraph and a list outside the quote", source: "> Quoted.\n- item\n" },
      {
        name: "a paragraph and the bullet list that interrupts it",
        source: "A paragraph.\n- item\n",
      },
      {
        name: "a paragraph and the ordered list that interrupts it",
        source: "A paragraph.\n1. item\n",
      },
      { name: "a table and the blockquote that terminates it", source: `${TABLE}> quote\n` },
      {
        name: "a paragraph and the fence that interrupts it",
        source: "A paragraph.\n```js\ncode\n```\n",
      },
      {
        name: "a paragraph and the table that interrupts it",
        source: "A paragraph.\n| a | b |\n| - | - |\n",
      },
      { name: "two footnote definitions", source: "[^a]: One\n[^b]: Two\n\n[^a] [^b]\n" },
      { name: "a heading and the paragraph under it", source: "# One\nA paragraph.\n" },
      { name: "a break and the paragraph under it", source: "***\nA paragraph.\n" },
      { name: "a fence and the paragraph under it", source: "```js\ncode\n```\nA paragraph.\n" },
      { name: "a heading and a setext heading under it", source: "# One\nSetext\n======\n" },
      { name: "a definition and the paragraph under it", source: "[a]: /1\nA paragraph.\n" },
      {
        name: "a titled definition and a quoted line under it",
        source: '[a]: /1 "T"\n"Not a title"\n',
      },
      { name: "two blocks inside a blockquote", source: "> Quoted.\n> # Heading\n" },
    ])("keeps $name", async ({ source }) => {
      await expectUnchanged(source);
    });
  });

  describe("keeps the blank line two blocks were written with", () => {
    it.each([
      { name: "two paragraphs", source: "First.\n\nSecond.\n" },
      { name: "a paragraph and a heading", source: "A paragraph.\n\n# Heading\n" },
      { name: "a heading and a paragraph", source: "# One\n\nA paragraph.\n" },
      { name: "two blocks inside a blockquote", source: "> Quoted.\n>\n> # Heading\n" },
      { name: "a blank-line run", source: "First.\n\n\n\nSecond.\n" },
    ])("keeps the blank line between $name", async ({ source }) => {
      await expectUnchanged(source);
    });
  });

  describe("withdraws the separator where the file would not read back the same", () => {
    it("separates a paragraph the file wrote a heading in the place of", async () => {
      const mounted = await mountEditor("A paragraph.\n# Heading\n");

      setSelectionAtDocumentEnd(mounted.view);
      // Turning the heading into a paragraph leaves the separator answering for a pair that now
      // merges into one paragraph, which is what the save has to refuse.
      void runEditorCommand(mounted.editor, "format.paragraph");

      expect(mounted.getMarkdown()).toBe("A paragraph.\n\nHeading\n");
    });

    it("separates a definition from a line it would take as its title", async () => {
      // A definition holding no title cannot be followed by a quoted line in a file, because the
      // parse reads that line as the title. Clearing the title is the edit that reaches the pair.
      const mounted = await mountEditor('[a]: /1 "T"\n"Not a title"\n');

      mounted.view.dispatch(mounted.view.state.tr.setNodeAttribute(0, "title", ""));

      expect(mounted.getMarkdown()).toBe('[a]: /1\n\n"Not a title"\n');
    });

    it("separates a raw HTML block from the block under it", async () => {
      await expectSaved("<div>\nraw\n</div>\n\n# Heading\n", "<div>\nraw\n</div>\n\n# Heading\n");
    });

    it("separates a paragraph from a run of hyphens, which would underline it", async () => {
      await expectSaved("A paragraph.\n\n---\n", "A paragraph.\n\n---\n");
    });
  });

  describe("writes a blank line for a block the editor created", () => {
    it("separates a heading inserted into a document that holds none", async () => {
      const mounted = await mountEditor("First.\n\nSecond.\n");

      mounted.view.dispatch(
        mounted.view.state.tr.insert(
          mounted.view.state.doc.content.size,
          mounted.view.state.schema.nodes.heading.create({ level: 2 }, [
            mounted.view.state.schema.text("Added"),
          ]),
        ),
      );

      expect(mounted.getMarkdown()).toBe("First.\n\nSecond.\n\n## Added\n");
    });
  });

  describe("corpus", () => {
    it("keeps the adjacent pairs a document holds throughout", async () => {
      mockTauriApiCommand("resolveMarkdownImageTarget", ({ target }) => ({
        kind: "renderable",
        path: `C:/Notes/${target}`,
      }));

      await expectUnchanged(
        [
          "# Level one #",
          "### Level three ###",
          "",
          "Paragraph followed by asterisks",
          "***",
          "",
          "[garden]: /plots/garden",
          "[field report]: /field-report",
          "",
          "> Quoted paragraph before a heading",
          "# heading outside the quote",
          "",
          TABLE.trimEnd(),
          "> A blockquote interrupts the table.",
          "",
        ].join("\n"),
      );
    });
  });
});
