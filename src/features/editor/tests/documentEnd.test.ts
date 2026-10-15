// @vitest-environment happy-dom

import { AllSelection, TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { formatMarkdownForSave, type LineEnding } from "@/features/document";
import { createMarkdownReferenceContext } from "@/test/factories/editor";
import { type MountedMilkdownEditor, setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  typeText,
} from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import { canUndo, redo, undo } from "../commands/editing/history";
import { hasActiveSourceProjection } from "../plugins/sourceProjection";
import { getEditorDocumentStatus } from "../utils/documentStatus";
import { getOutlineHeadings } from "../utils/headingOutline";

const mountEditor = setupMilkdownEditorMount(createMarkdownReferenceContext());

const save = (
  mounted: MountedMilkdownEditor,
  insertFinalNewline = true,
  lineEnding: LineEnding = "lf",
) => formatMarkdownForSave(mounted.getMarkdown(), lineEnding, insertFinalNewline);

const readRecord = (mounted: MountedMilkdownEditor) =>
  mounted.view.state.doc.attrs.trailingBlankLines as number;

const selectAll = (mounted: MountedMilkdownEditor) => {
  mounted.view.dispatch(
    mounted.view.state.tr.setSelection(new AllSelection(mounted.view.state.doc)),
  );
};

const appendParagraph = (mounted: MountedMilkdownEditor, text?: string) => {
  const { state } = mounted.view;
  const paragraph = state.schema.nodes.paragraph.create(
    null,
    text ? state.schema.text(text) : null,
  );

  mounted.view.dispatch(state.tr.insert(state.doc.content.size, paragraph));
};

// Saves under one setting, then reopens and saves the result again, which a save has to write
// back unchanged and read as the same document.
const expectStableSave = async (
  mounted: MountedMilkdownEditor,
  insertFinalNewline: boolean,
  lineEnding: LineEnding = "lf",
) => {
  const saved = save(mounted, insertFinalNewline, lineEnding);
  const reopened = await mountEditor(saved);

  expect(save(reopened, insertFinalNewline, lineEnding)).toBe(saved);
  expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());

  return saved;
};

describe("Trailing blank lines", () => {
  describe("on save", () => {
    it.each([
      { source: "", on: "", off: "" },
      { source: "text", on: "text\n", off: "text" },
      { source: "text\n", on: "text\n", off: "text" },
      { source: "text\n\n", on: "text\n\n", off: "text\n\n" },
      { source: "text\n\n\n", on: "text\n\n\n", off: "text\n\n\n" },
      { source: "text\n  \n\t\n", on: "text\n\n\n", off: "text\n\n\n" },
      { source: "text\n\n  ", on: "text\n\n", off: "text\n\n" },
      { source: "\n", on: "\n", off: "\n" },
      { source: "\n\n\n", on: "\n\n\n", off: "\n\n\n" },
      { source: " \n\t\n", on: "\n\n", off: "\n\n" },
    ])(
      "writes $source as $on with a final newline and $off without",
      async ({ source, on, off }) => {
        for (const lineEnding of ["lf", "crlf"] as const) {
          const newline = lineEnding === "crlf" ? "\r\n" : "\n";
          const mounted = await mountEditor(source.replaceAll("\n", newline));

          expect(await expectStableSave(mounted, true, lineEnding)).toBe(
            on.replaceAll("\n", newline),
          );
          expect(await expectStableSave(mounted, false, lineEnding)).toBe(
            off.replaceAll("\n", newline),
          );
        }
      },
    );

    it("writes the blank lines of a file with bare carriage returns in the chosen line ending", async () => {
      const mounted = await mountEditor("text\r\r\r");

      expect(save(mounted, false, "crlf")).toBe("text\r\n\r\n\r\n");
      expect(save(mounted, true, "lf")).toBe("text\n\n\n");
    });

    it.each([
      "# Heading\n\n\n",
      "- item\n\n\n",
      "> quote\n\n\n",
      "```js\ncode\n```\n\n\n",
      "    indented code\n\n\n",
      "<div>\n\n\n",
      "<!-- comment -->\n\n\n",
      "$$\nx\n$$\n\n\n",
      "| a |\n| - |\n| b |\n\n\n",
      "[^1]: note\n\n\n",
      "[label]: /url\n\n\n",
      "Term\n: definition\n\n\n",
      "> [!NOTE]\n> text\n\n\n",
      "---\ntitle: Notes\n---\n\n\n",
      "a\n\n\n\nb\n\n\n",
    ])("keeps the blank lines after %j under either setting", async (source) => {
      const mounted = await mountEditor(source);

      expect(readRecord(mounted)).toBe(2);
      expect(await expectStableSave(mounted, true)).toBe(source);
      expect(await expectStableSave(mounted, false)).toBe(source);
    });

    it.each([
      "```\ncode\n\n\n",
      "- ```\n  code\n\n\n",
      "Term\n: ```\n  code\n\n\n",
      "<!-- comment\n\n\n",
      "<pre>\n\n\n",
      "<?php\n\n\n",
      "<!DOCTYPE\n\n\n",
      "<![CDATA[\n\n\n",
      "[^1]: <!-- comment\n\n\n",
    ])("leaves the blank lines %j holds in its last block to that block", async (source) => {
      const mounted = await mountEditor(source);

      expect(readRecord(mounted)).toBe(0);
      expect(await expectStableSave(mounted, true)).toBe(source);
      expect(await expectStableSave(mounted, false)).toBe(source);
    });

    it("keeps the blank paragraphs between blocks as they were", async () => {
      const mounted = await mountEditor("a\n\n\n\nb\n\n\n\n\n\nc\n\n");

      expect(mounted.view.state.doc.childCount).toBe(6);
      expect(save(mounted)).toBe("a\n\n\n\nb\n\n\n\n\n\nc\n\n");
    });
  });

  describe("on open", () => {
    it("adds no block, text, outline entry, or count for the blank lines", async () => {
      const withLines = await mountEditor("# Title\n\nText\n\n\n\n");
      const withoutLines = await mountEditor("# Title\n\nText\n");

      expect(withLines.view.state.doc.content.toJSON()).toEqual(
        withoutLines.view.state.doc.content.toJSON(),
      );
      expect(withLines.view.dom.innerHTML).toBe(withoutLines.view.dom.innerHTML);
      expect(getOutlineHeadings(withLines.view.state.doc)).toEqual(
        getOutlineHeadings(withoutLines.view.state.doc),
      );
      expect(getEditorDocumentStatus(withLines.view.state).document).toEqual(
        getEditorDocumentStatus(withoutLines.view.state).document,
      );

      setSelectionAtDocumentEnd(withLines.view);

      expect(withLines.view.state.selection.from).toBe(
        TextSelection.atEnd(withoutLines.view.state.doc).from,
      );
    });

    it("opens a file of blank lines as one empty paragraph", async () => {
      const mounted = await mountEditor("\n\n\n");

      expect(mounted.view.state.doc.childCount).toBe(1);
      expect(getEditorTextContent(mounted)).toBe("");
      expect(readRecord(mounted)).toBe(3);
    });

    it("gives a new document none", async () => {
      expect(readRecord(await mountEditor(""))).toBe(0);
    });

    it("leaves opening, saving, and moving the caret out of history and dirty state", async () => {
      const onContentChanged = vi.fn();
      const mounted = await mountEditor("text\n\n\n", { onContentChanged });

      save(mounted, true);
      save(mounted, false);
      setSelectionAtDocumentEnd(mounted.view);

      expect(onContentChanged).not.toHaveBeenCalled();
      expect(canUndo(mounted.view.state)).toBe(false);
      expect(readRecord(mounted)).toBe(2);
    });
  });

  describe("while editing", () => {
    it("stays after the last block while that block is edited", async () => {
      const mounted = await mountEditor("text\n\n\n");

      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, "!");

      expect(save(mounted, false)).toBe("text!\n\n\n");

      const { state } = mounted.view;

      mounted.view.dispatch(
        state.tr.setBlockType(0, state.doc.content.size, state.schema.nodes.heading, {
          level: 2,
        }),
      );

      expect(save(mounted, false)).toBe("## text!\n\n\n");
    });

    it("moves to a block appended after the last one", async () => {
      const mounted = await mountEditor("text\n\n\n");

      appendParagraph(mounted, "more");

      expect(save(mounted)).toBe("text\n\nmore\n\n\n");
    });

    it("moves to the block before the last one when the last is removed", async () => {
      const mounted = await mountEditor("first\n\nlast\n\n\n");
      const { state } = mounted.view;

      mounted.view.dispatch(state.tr.delete(state.doc.child(0).nodeSize, state.doc.content.size));

      expect(save(mounted)).toBe("first\n\n\n");
    });

    it("stays when the text of the only block is replaced", async () => {
      const mounted = await mountEditor("text\n\n\n");

      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(TextSelection.create(mounted.view.state.doc, 1, 5)),
      );
      typeText(mounted.view, "new");

      expect(save(mounted)).toBe("new\n\n\n");
    });

    it("counts an empty paragraph made after them once, however often it is saved", async () => {
      const mounted = await mountEditor("text\n\n\n");

      appendParagraph(mounted);

      expect(save(mounted)).toBe("text\n\n\n\n");
      expect(save(mounted)).toBe("text\n\n\n\n");

      const reopened = await mountEditor(save(mounted));

      expect(reopened.view.state.doc.childCount).toBe(1);
      expect(readRecord(reopened)).toBe(3);
      expect(save(reopened)).toBe("text\n\n\n\n");
    });

    it("writes an empty paragraph made at the end as a blank line under either setting", async () => {
      const mounted = await mountEditor("text");

      appendParagraph(mounted);

      expect(save(mounted, true)).toBe("text\n\n");
      expect(save(mounted, false)).toBe("text\n\n");
      expect(readRecord(await mountEditor(save(mounted)))).toBe(1);
    });

    it("is written as no blank lines while the last block would take them as code", async () => {
      const mounted = await mountEditor("text\n\n\n");
      const { state } = mounted.view;

      mounted.view.dispatch(
        state.tr.insert(
          state.doc.content.size,
          state.schema.nodes.code_block.create({ closed: false }, state.schema.text("code")),
        ),
      );

      expect(save(mounted)).toBe("text\n\n```\ncode\n");

      const reopened = await mountEditor(save(mounted));

      expect(readRecord(reopened)).toBe(0);
      expect(save(reopened)).toBe("text\n\n```\ncode\n");

      const { tr } = mounted.view.state;

      mounted.view.dispatch(
        tr.delete(mounted.view.state.doc.child(0).nodeSize, tr.doc.content.size),
      );

      expect(save(mounted)).toBe("text\n\n\n");
    });

    it("is written as no blank lines while the last block would take them as raw HTML", async () => {
      const mounted = await mountEditor("text\n\n\n");
      const { state } = mounted.view;

      mounted.view.dispatch(
        state.tr.insert(
          state.doc.content.size,
          state.schema.nodes.paragraph.create(
            null,
            state.schema.nodes.html.create({ value: "<!-- open" }),
          ),
        ),
      );

      const saved = save(mounted);

      expect(saved).toBe("text\n\n<!-- open\n");

      const reopened = await mountEditor(saved);

      expect(readRecord(reopened)).toBe(0);
      expect(save(reopened)).toBe(saved);
    });

    it("keeps them through the projection a save finalizes at the end", async () => {
      const mounted = await mountEditor("Read [the guide](guide.md)\n\n\n");

      enterProjection(mounted, "a");
      typeText(mounted.view, "s");

      expect(save(mounted)).toBe("Read [the guides](guide.md)\n\n\n");
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    });
  });

  describe("when the whole document is replaced", () => {
    it.each([
      {
        name: "typing over it",
        replace: (mounted: MountedMilkdownEditor) => {
          mounted.view.dispatch(mounted.view.state.tr.insertText("new"));
        },
        expected: "new\n",
      },
      {
        name: "deleting it",
        replace: (mounted: MountedMilkdownEditor) => {
          runKeyDownHandlers(mounted.view, "Backspace");
        },
        expected: "",
      },
      {
        name: "pasting over it",
        replace: (mounted: MountedMilkdownEditor) => {
          mounted.view.pasteText("pasted");
        },
        expected: "pasted\n",
      },
    ])(
      "goes with the content when $name, and Undo brings both back",
      async ({ replace, expected }) => {
        const onContentChanged = vi.fn();
        const mounted = await mountEditor("first\n\nlast\n\n\n", { onContentChanged });

        selectAll(mounted);
        replace(mounted);

        expect(save(mounted, false)).toBe(expected.replace(/\n$/u, ""));
        expect(save(mounted, true)).toBe(expected);
        expect(onContentChanged).toHaveBeenCalled();

        while (canUndo(mounted.view.state)) {
          undo(mounted.view);
        }

        expect(readRecord(mounted)).toBe(2);
        expect(save(mounted)).toBe("first\n\nlast\n\n\n");

        redo(mounted.view);

        expect(readRecord(mounted)).toBe(0);
      },
    );

    it("leaves them when the selected document is only formatted", async () => {
      const mounted = await mountEditor("text\n\n\n");
      const { schema } = mounted.view.state;

      selectAll(mounted);
      mounted.view.dispatch(
        mounted.view.state.tr.addMark(
          0,
          mounted.view.state.doc.content.size,
          schema.marks.strong.create(),
        ),
      );

      expect(save(mounted)).toBe("**text**\n\n\n");
    });
  });
});
