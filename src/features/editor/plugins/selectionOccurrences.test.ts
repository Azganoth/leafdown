// @vitest-environment happy-dom

import { undoDepth } from "@milkdown/kit/prose/history";
import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  selectTableCellRange,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { changeSearchQuery, closeSearch, openSearch } from "../commands/editing/search";
import { createHierarchicalBlockSelection } from "./blockSelection";
import { CHOSEN_SEARCH_MATCH_CLASS, SEARCH_MATCH_CLASS, setSearchUpdate } from "./search";
import { findSelectionOccurrences, SELECTION_OCCURRENCE_CLASS } from "./selectionOccurrences";
import { hasActiveSourceProjection } from "./sourceProjection";

const mountEditor = setupMilkdownEditorMount();

/** Selects `length` characters from where `text` first starts, or all of `text`. */
const selectText = (mounted: MountedMilkdownEditor, text: string, length = text.length) => {
  const from = getEditorTextPosition(mounted, text);

  setTextSelection(mounted.view, from, from + length);
};

/** Selects `word` at the end of the last block. */
const selectLastWord = (mounted: MountedMilkdownEditor, word: string) => {
  const end = mounted.view.state.doc.content.size - 1;

  setTextSelection(mounted.view, end - word.length, end);
};

const selectionCrossesInlineNode = (mounted: MountedMilkdownEditor) => {
  const { doc, selection } = mounted.view.state;
  let crosses = false;

  doc.nodesBetween(selection.from, selection.to, (node) => {
    crosses ||= node.isInline && !node.isText;
  });

  return crosses;
};

const getOccurrenceTexts = (mounted: MountedMilkdownEditor) =>
  findSelectionOccurrences(mounted.view.state)?.map(({ from, to }) =>
    mounted.view.state.doc.textBetween(from, to),
  ) ?? null;

const getHighlights = (mounted: MountedMilkdownEditor) =>
  mounted.root.querySelectorAll(`.${SELECTION_OCCURRENCE_CLASS}`);

describe("selection occurrences", () => {
  it("highlights other whole-word occurrences of the selected spelling", async () => {
    const mounted = await mountEditor(
      "leaf Leaf leaflet leaf_x leaf2 leaf.\n\nAnother leaf, then LEAF.\n",
    );

    selectText(mounted, "leaf", 4);
    const { from, to } = mounted.view.state.selection;

    expect(getOccurrenceTexts(mounted)).toEqual(["leaf", "leaf"]);
    expect(Array.from(getHighlights(mounted), (element) => element.textContent)).toEqual([
      "leaf",
      "leaf",
    ]);
    expect(findSelectionOccurrences(mounted.view.state)?.some((range) => range.from === from)).toBe(
      false,
    );
    expect(mounted.view.state.selection.from).toBe(from);
    expect(mounted.view.state.selection.to).toBe(to);
  });

  it("reads words by Unicode letters, marks, numbers, and underscores", async () => {
    const mounted = await mountEditor("café café café-noir 日本 日本語 x_1 x_1x 東京 x_1.\n");

    selectText(mounted, "café");

    expect(getOccurrenceTexts(mounted)).toEqual(["café"]);

    selectText(mounted, "cafe");

    expect(getOccurrenceTexts(mounted)).toBeNull();

    selectText(mounted, "日本");

    expect(getOccurrenceTexts(mounted)).toEqual([]);

    selectText(mounted, "x_1");

    expect(getOccurrenceTexts(mounted)).toEqual(["x_1"]);
  });

  it("finds occurrences whose text spans inline formatting", async () => {
    const mounted = await mountEditor("Plain leaf, le**af**, *leaf*, and [leaf](./leaf.md).\n");

    selectText(mounted, "leaf");

    expect(getOccurrenceTexts(mounted)).toEqual(["leaf", "leaf", "leaf"]);
  });

  it("does not activate for a caret, part of a word, several words, or punctuation", async () => {
    const mounted = await mountEditor("leaf one, leaf two, leaf.\n");
    const start = getEditorTextPosition(mounted, "leaf");

    setTextSelection(mounted.view, start);
    expect(getOccurrenceTexts(mounted)).toBeNull();

    selectText(mounted, "leaf", 3);
    expect(getOccurrenceTexts(mounted)).toBeNull();

    selectText(mounted, "leaf one");
    expect(getOccurrenceTexts(mounted)).toBeNull();

    selectText(mounted, "leaf.");
    expect(getOccurrenceTexts(mounted)).toBeNull();
    expect(getHighlights(mounted)).toHaveLength(0);
  });

  it("does not activate for block, node, or cell selections", async () => {
    const mounted = await mountEditor(
      "leaf\n\nleaf\n\n| leaf | head |\n| --- | --- |\n| leaf | cell |\n",
    );
    const paragraph = 0;

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, paragraph, paragraph),
      ),
    );
    expect(getOccurrenceTexts(mounted)).toBeNull();

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, paragraph)),
    );
    expect(getOccurrenceTexts(mounted)).toBeNull();

    selectTableCellRange(mounted, { row: 1, col: 0 }, { row: 1, col: 0 });
    expect(getOccurrenceTexts(mounted)).toBeNull();
    expect(getHighlights(mounted)).toHaveLength(0);
  });

  it("does not activate for projected source", async () => {
    const mounted = await mountEditor("Plain leaf and **bold leaf** text.\n");

    selectText(mounted, "leaf text", 4);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getOccurrenceTexts(mounted)).toBeNull();
    expect(getHighlights(mounted)).toHaveLength(0);
  });

  it("leaves frontmatter and definition labels and fields out", async () => {
    const mounted = await mountEditor(
      [
        "---",
        "title: leaf",
        "---",
        "",
        "Plain leaf, a [reference][leaf], and a note[^leaf].",
        "",
        '[leaf]: ./leaf.md "leaf"',
        "",
        "[^leaf]: The leaf note.",
        "",
      ].join("\n"),
    );

    selectText(mounted, "leaf, a", 4);

    expect(getOccurrenceTexts(mounted)).toEqual(["leaf"]);
    expect(findSelectionOccurrences(mounted.view.state)?.[0].from).toBe(
      getEditorTextPosition(mounted, "leaf note"),
    );

    const frontmatterWord = getEditorTextPosition(mounted, "title: leaf") + "title: ".length;
    setTextSelection(mounted.view, frontmatterWord, frontmatterWord + 4);

    expect(mounted.view.state.selection.$from.parent.type.name).toBe("frontmatter");
    expect(getOccurrenceTexts(mounted)).toBeNull();
  });

  it("does not reach across a block, a hard break, or an inline object", async () => {
    const mounted = await mountEditor("le\\\naf, le![leaf](./a.png)af\n\nle\n\naf\n\nleaf\n");
    selectLastWord(mounted, "leaf");

    expect(getOccurrenceTexts(mounted)).toEqual([]);

    // The text before and after the hard break, then before and after the image.
    selectText(mounted, "leaf");
    expect(selectionCrossesInlineNode(mounted)).toBe(true);
    expect(getOccurrenceTexts(mounted)).toBeNull();

    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, ", le") + 2,
      getEditorTextPosition(mounted, "afle") + 2,
    );
    expect(selectionCrossesInlineNode(mounted)).toBe(true);
    expect(getOccurrenceTexts(mounted)).toBeNull();
  });

  it("includes code block text", async () => {
    const mounted = await mountEditor("```\nconst leaf = 1;\n```\n\nleaf\n");

    selectLastWord(mounted, "leaf");

    expect(getOccurrenceTexts(mounted)).toEqual(["leaf"]);
  });

  it("follows selection and document changes", async () => {
    const mounted = await mountEditor("leaf one, leaf two\n");

    selectText(mounted, "leaf");
    expect(getHighlights(mounted)).toHaveLength(1);

    setTextSelection(mounted.view, mounted.view.state.selection.to);
    expect(getHighlights(mounted)).toHaveLength(0);

    selectText(mounted, "leaf");
    mounted.view.dispatch(
      mounted.view.state.tr.insertText(" leaf", mounted.view.state.doc.content.size - 1),
    );
    expect(getHighlights(mounted)).toHaveLength(2);

    const second = getEditorTextPosition(mounted, "leaf two");
    mounted.view.dispatch(mounted.view.state.tr.insertText("x", second + 4));
    expect(getHighlights(mounted)).toHaveLength(1);

    selectText(mounted, "one");
    expect(getHighlights(mounted)).toHaveLength(0);
  });

  it("gives way to search and returns for the match it leaves selected", async () => {
    const mounted = await mountEditor("leaf one, leaf two, leaflet\n");

    selectText(mounted, "leaf");
    expect(getHighlights(mounted)).toHaveLength(1);

    openSearch(mounted.view, "find");

    expect(getHighlights(mounted)).toHaveLength(0);
    expect(mounted.root.querySelectorAll(`.${SEARCH_MATCH_CLASS}`)).toHaveLength(3);

    closeSearch(mounted.view);

    expect(getHighlights(mounted)).toHaveLength(1);

    openSearch(mounted.view, "find");
    changeSearchQuery(mounted.view, { query: "leafl" });
    closeSearch(mounted.view);

    expect(
      mounted.view.state.doc.textBetween(
        mounted.view.state.selection.from,
        mounted.view.state.selection.to,
      ),
    ).toBe("leafl");
    expect(getHighlights(mounted)).toHaveLength(0);
  });

  it("gives way while a folder search match is shown", async () => {
    const mounted = await mountEditor("leaf one, leaf two\n");
    const second = getEditorTextPosition(mounted, "leaf two");

    selectText(mounted, "leaf");
    expect(getHighlights(mounted)).toHaveLength(1);

    mounted.view.dispatch(
      setSearchUpdate(mounted.view.state.tr, {
        change: { chosen: { from: second, to: second + 4 } },
      }),
    );

    expect(getHighlights(mounted)).toHaveLength(0);
    expect(mounted.root.querySelectorAll(`.${CHOSEN_SEARCH_MATCH_CLASS}`)).toHaveLength(1);

    mounted.view.dispatch(setSearchUpdate(mounted.view.state.tr, { change: { chosen: null } }));

    expect(getHighlights(mounted)).toHaveLength(1);
  });

  it("changes neither the document, its history, its unsaved state, nor the selection", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor("leaf one, leaf two\n", { onContentChanged });
    const markdown = mounted.getMarkdown();

    selectText(mounted, "leaf");
    const selection = mounted.view.state.selection;

    expect(getHighlights(mounted)).toHaveLength(1);
    expect(mounted.view.state.selection).toBe(selection);
    expect(mounted.getMarkdown()).toBe(markdown);
    expect(undoDepth(mounted.view.state)).toBe(0);
    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it("highlights the occurrences around the selection and finds every one", async () => {
    const mounted = await mountEditor(`${Array.from({ length: 450 }, () => "leaf").join(" ")}\n`);

    selectText(mounted, "leaf");

    expect(findSelectionOccurrences(mounted.view.state)).toHaveLength(449);
    expect(getHighlights(mounted)).toHaveLength(200);

    const middle = getEditorTextPosition(mounted, "leaf") + 225 * 5;
    setTextSelection(mounted.view, middle, middle + 4);

    expect(findSelectionOccurrences(mounted.view.state)).toHaveLength(449);
    expect(getHighlights(mounted)).toHaveLength(400);
  });
});
