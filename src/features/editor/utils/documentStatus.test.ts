// @vitest-environment happy-dom

import { AllSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { BASIC_TABLE_MARKDOWN, EXTENDED_TABLE_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  selectTableCellRange,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import { getEditorDocumentStatus } from "./documentStatus";

const mountEditor = setupMilkdownEditorMount();

const statusOf = (mounted: MountedMilkdownEditor) => getEditorDocumentStatus(mounted.view.state);

const placeCaretIn = (mounted: MountedMilkdownEditor, text: string) =>
  setTextSelection(mounted.view, getEditorTextPosition(mounted, text) + 1);

describe("editor document status", () => {
  describe("block path", () => {
    it.each([
      ["Plain words", "Plain", ["Paragraph"]],
      ["### Third level", "Third", ["Heading 3"]],
      ["```ts\nconst value = 1;\n```", "const", ["Code block · ts"]],
      ["```\nuntyped\n```", "untyped", ["Code block"]],
      ["1. first item", "first", ["Ordered list", "Paragraph"]],
      ["Note[^1]\n\n[^1]: The footnote", "footnote", ["Footnote definition", "Paragraph"]],
    ])("names the block holding the caret in %j", async (markdown, text, blockPath) => {
      const mounted = await mountEditor(markdown);
      placeCaretIn(mounted, text);

      expect(statusOf(mounted).blockPath).toEqual(blockPath);
    });

    it("lists every enclosing block from the outermost", async () => {
      const mounted = await mountEditor("> - [ ] quoted task\n>   - nested bullet");
      placeCaretIn(mounted, "quoted");

      expect(statusOf(mounted).blockPath).toEqual(["Blockquote", "Task list", "Paragraph"]);

      placeCaretIn(mounted, "nested");

      expect(statusOf(mounted).blockPath).toEqual([
        "Blockquote",
        "Task list",
        "Unordered list",
        "Paragraph",
      ]);
    });

    it("names the row and column of a table cell", async () => {
      const mounted = await mountEditor(BASIC_TABLE_MARKDOWN);
      placeCaretIn(mounted, "D");

      expect(statusOf(mounted).blockPath).toEqual(["Table", "Row 2, Column 2"]);

      placeCaretIn(mounted, "A");

      expect(statusOf(mounted).blockPath).toEqual(["Table", "Row 1, Column 1"]);
    });

    it("is withheld while a selection is expanded", async () => {
      const mounted = await mountEditor("Some words here");
      const from = getEditorTextPosition(mounted, "words");
      setTextSelection(mounted.view, from, from + 5);

      expect(statusOf(mounted).blockPath).toBeNull();
    });
  });

  describe("text statistics", () => {
    it("counts words and characters across the whole document", async () => {
      const mounted = await mountEditor(
        "# Title here\n\nOne **bold** word.\n\n```\ncode line\nnext\n```",
      );

      expect(statusOf(mounted).document).toEqual({
        characters: 37,
        charactersWithoutSpaces: 33,
        words: 8,
      });
      expect(statusOf(mounted).selection).toBeNull();
    });

    it("counts an empty document as nothing", async () => {
      const mounted = await mountEditor("");

      expect(statusOf(mounted)).toEqual({
        blockPath: ["Paragraph"],
        document: { characters: 0, charactersWithoutSpaces: 0, words: 0 },
        selection: null,
      });
    });

    it("counts image descriptions and live HTML text but not Markdown metadata", async () => {
      const mounted = await mountEditor(
        [
          "Press <kbd>Enter</kbd> now![a leaf](leaf.png)",
          "Cited[^note] claim",
          "[^note]: Footnote body",
          "[ref]: https://example.com/long/path 'A title'",
          "tail",
        ].join("\n\n"),
      );
      setSelectionAtDocumentEnd(mounted.view);

      expect(statusOf(mounted).document.words).toBe(10);
    });

    it("keeps words apart across a hard break", async () => {
      const mounted = await mountEditor("first\\\nsecond");

      expect(statusOf(mounted).document).toEqual({
        characters: 11,
        charactersWithoutSpaces: 11,
        words: 2,
      });
    });

    it("counts only the selected part of the document", async () => {
      const mounted = await mountEditor("Alpha beta gamma\n\nDelta epsilon");
      const from = getEditorTextPosition(mounted, "beta");
      const to = getEditorTextPosition(mounted, "silon");
      setTextSelection(mounted.view, from, to);

      expect(statusOf(mounted).selection).toEqual({
        characters: 18,
        charactersWithoutSpaces: 16,
        words: 4,
      });
      expect(statusOf(mounted).document.words).toBe(5);
    });

    it("counts a whole-document selection as the document", async () => {
      const mounted = await mountEditor("Alpha beta\n\n- gamma delta");
      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(new AllSelection(mounted.view.state.doc)),
      );

      expect(statusOf(mounted).selection).toEqual(statusOf(mounted).document);
    });

    it("counts each selected table cell", async () => {
      const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);
      selectTableCellRange(mounted, { row: 1, col: 0 }, { row: 2, col: 0 });

      expect(statusOf(mounted).selection?.words).toBe(2);
      expect(statusOf(mounted).blockPath).toBeNull();
    });

    it("ignores Markdown source shown while editing a link", async () => {
      const mounted = await mountEditor(
        "Read [the guide](https://example.com/docs/start) today\n\nplain end",
      );
      setSelectionAtDocumentEnd(mounted.view);
      const canonical = statusOf(mounted).document;

      enterProjection(mounted, "a");

      expect(statusOf(mounted).document).toEqual(canonical);
      expect(statusOf(mounted).blockPath).toEqual(["Paragraph"]);
    });

    it("counts a projected selection by the text it stands for", async () => {
      const mounted = await mountEditor("**Bold words** after\n\nplain end");
      enterProjection(mounted, "strong");
      const from = getEditorTextPosition(mounted, "**Bold");
      const to = getEditorTextPosition(mounted, "after") + "after".length;
      setTextSelection(mounted.view, from, to);

      expect(statusOf(mounted).selection).toEqual({
        characters: 16,
        charactersWithoutSpaces: 14,
        words: 3,
      });
    });
  });

  it("notifies when the counts or the caret's block change", async () => {
    const onDocumentStatusChanged = vi.fn();
    const mounted = await mountEditor("First\n\n# Second", { onDocumentStatusChanged });
    placeCaretIn(mounted, "First");
    onDocumentStatusChanged.mockClear();

    placeCaretIn(mounted, "irst");

    expect(onDocumentStatusChanged).not.toHaveBeenCalled();

    typeText(mounted.view, " more");

    expect(onDocumentStatusChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ document: expect.objectContaining({ words: 3 }) }),
    );

    placeCaretIn(mounted, "Second");

    expect(onDocumentStatusChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ blockPath: ["Heading 1"] }),
    );
  });
});
