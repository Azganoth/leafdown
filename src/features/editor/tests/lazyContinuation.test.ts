// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

// A continuation line is where the leading whitespace decides what the line belongs to, so every
// prefix is checked against the document it reopens as rather than against the bytes alone.
const expectSaved = async (source: string, expected: string) => {
  const before = await mountEditor(source);
  const beforeDocument: unknown = before.view.state.doc.toJSON();
  const written = before.getMarkdown();

  expect(written).toBe(expected);

  const after = await mountEditor(written);

  expect(after.view.state.doc.toJSON()).toEqual(beforeDocument);
};

const expectUnchanged = (source: string) => expectSaved(source, source);

describe("Lazy continuation", () => {
  describe("keeps the marker a continuation line was written without", () => {
    it.each([
      {
        name: "a quoted paragraph's second line",
        source: "> First quoted line\nlazy continuation without another marker\n",
      },
      { name: "a bullet item's second line", source: "- item\nlazy continuation\n" },
      { name: "an ordered item's second line", source: "1. item\nlazy continuation\n" },
      {
        name: "a task item's second line",
        source: "- [x]missing following whitespace\n[ ] not a list item\n",
      },
      {
        name: "the inner quote of two the outer line still spells",
        source: "> outer\n> > nested first\n> lazy one\nlazy two\n",
      },
      {
        name: "a footnote definition's second line",
        source: "[^note]: First line\nlazy continuation\n\nText[^note]\n",
      },
      {
        name: "an item's second line under a quote marker the line keeps",
        source: "> - item\n> lazy continuation\n",
      },
    ])("keeps $name lazy", async ({ source }) => {
      await expectUnchanged(source);
    });

    it("keeps the escape a lazy line still needs", async () => {
      await expectUnchanged("> quoted\n\\# not a heading\n");
    });
  });

  describe("keeps the indentation a continuation line was written with", () => {
    it.each([
      {
        name: "four columns, where no block can open",
        source: "#no separator\n####### seven hashes\n    # indented as code\n",
      },
      { name: "three columns, where one still can", source: "A paragraph\n   \\# not a heading\n" },
      { name: "four columns inside a quote", source: "> quoted\n>     # indented as code\n" },
      { name: "four columns on a lazy line", source: "> quoted\n    # indented as code\n" },
      { name: "four columns past an item's own", source: "- item\n      # indented as code\n" },
    ])("keeps $name", async ({ source }) => {
      await expectUnchanged(source);
    });
  });

  describe("keeps the prefix the containers write where the file wrote it", () => {
    it.each([
      { name: "a quoted paragraph", source: "> First quoted line\n> second quoted line\n" },
      { name: "a bullet item", source: "- item\n  second line\n" },
      { name: "a nested quote", source: "> > nested first\n> > nested second\n" },
    ])("keeps the prefix on $name", async ({ source }) => {
      await expectUnchanged(source);
    });
  });

  describe("writes the prefix the containers spell where the file wrote none", () => {
    it("writes it for a line added to the paragraph", async () => {
      const mounted = await mountEditor("> First quoted line\nlazy continuation\n");

      setSelectionAtDocumentEnd(mounted.view);
      mounted.view.dispatch(mounted.view.state.tr.insertText("\nadded line"));

      expect(mounted.getMarkdown()).toBe("> First quoted line\nlazy continuation\n> added line\n");
    });

    it("withdraws a prefix spelling a quote the document no longer holds", async () => {
      const mounted = await mountEditor("> First quoted line\n> second quoted line\n");

      setSelectionAtDocumentEnd(mounted.view);
      // Writing the recorded `> ` onto a paragraph the quote no longer holds would open a quote of
      // its own, which is the direction the record has to give way in.
      void runEditorCommand(mounted.editor, "format.blockquote");

      expect(mounted.getMarkdown()).toBe("First quoted line\nsecond quoted line\n");
    });
  });
});
