// @vitest-environment happy-dom

import { undoDepth } from "@milkdown/kit/prose/history";
import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  getSelectedEditorText,
  setSelectionAtDocumentEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import {
  CURRENT_SEARCH_MATCH_CLASS,
  getCurrentSearchMatchIndex,
  getSearchMatches,
  getSearchState,
  SEARCH_MATCH_CLASS,
} from "../../plugins/search";
import { hasActiveSourceProjection } from "../../plugins/sourceProjection";
import { redo, undo } from "./history";
import {
  canFindAdjacentMatch,
  changeSearchQuery,
  closeSearch,
  findNext,
  findPrevious,
  openSearch,
  replaceAllSearchMatches,
  replaceSearchMatch,
} from "./search";

const mountEditor = setupMilkdownEditorMount();

// The caret rests in a trailing plain paragraph, so no object opens its source under the search.
const mountDocument = async (markdown: string, onContentChanged?: () => void) => {
  const mounted = await mountEditor(`${markdown}\n\nZ\n`, { onContentChanged });

  setSelectionAtDocumentEnd(mounted.view);

  return mounted;
};

const selectText = (mounted: MountedMilkdownEditor, text: string) => {
  const from = getEditorTextPosition(mounted, text);

  setTextSelection(mounted.view, from, from + text.length);
};

const search = (mounted: MountedMilkdownEditor, query: string) => {
  openSearch(mounted.view, "find");
  changeSearchQuery(mounted.view, { query });
};

const getHighlightedTexts = (mounted: MountedMilkdownEditor) =>
  Array.from(
    mounted.root.querySelectorAll(`.${SEARCH_MATCH_CLASS}`),
    (element) => element.textContent,
  );

const getCurrentMatch = (mounted: MountedMilkdownEditor) => {
  const current = getCurrentSearchMatchIndex(mounted.view.state);

  return current === null ? null : getSearchMatches(mounted.view.state)[current];
};

const getCurrentText = (mounted: MountedMilkdownEditor) => {
  const match = getCurrentMatch(mounted);

  return match ? mounted.view.state.doc.textBetween(match.from, match.to) : null;
};

const getCurrentPosition = (mounted: MountedMilkdownEditor) =>
  getCurrentMatch(mounted)?.from ?? null;

describe("editor search", () => {
  it("opens on the selected text and highlights every match without moving the caret", async () => {
    const mounted = await mountDocument("One leaf, two leafs, red leaf.");

    selectText(mounted, "leaf");
    const { from, to } = mounted.view.state.selection;

    expect(openSearch(mounted.view, "find")).toBe(true);

    const state = getSearchState(mounted.view.state);

    expect(state.open).toBe(true);
    expect(state.query).toBe("leaf");
    expect(getSearchMatches(mounted.view.state)).toHaveLength(3);
    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBe(0);
    expect(getHighlightedTexts(mounted)).toEqual(["leaf", "leaf", "leaf"]);
    expect(mounted.root.querySelector(`.${CURRENT_SEARCH_MATCH_CLASS}`)?.textContent).toBe("leaf");
    expect(mounted.view.state.selection.from).toBe(from);
    expect(mounted.view.state.selection.to).toBe(to);
  });

  it("keeps the replace row and the current match when asked to find again", async () => {
    const mounted = await mountDocument("leaf one, leaf two");

    openSearch(mounted.view, "replace");
    changeSearchQuery(mounted.view, { query: "leaf" });
    findNext(mounted.view);
    openSearch(mounted.view, "find");

    expect(getSearchState(mounted.view.state).mode).toBe("replace");
    expect(getSearchState(mounted.view.state).focusRequest?.target).toBe("query");
    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBe(1);
  });

  it("does not take a query from a selection that is not one run of text", async () => {
    const mounted = await mountDocument("First leaf.\n\nSecond leaf.");

    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "leaf."),
      getEditorTextPosition(mounted, "Second") + 3,
    );
    openSearch(mounted.view, "find");

    expect(getSearchState(mounted.view.state).query).toBe("");
    expect(canFindAdjacentMatch(mounted.view.state)).toBe(false);
  });

  it("moves between matches and wraps at both ends, leaving the selection alone", async () => {
    const mounted = await mountDocument("leaf one, leaf two, leaf three");
    const { selection } = mounted.view.state;

    search(mounted, "leaf");

    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBe(0);

    findNext(mounted.view);
    findNext(mounted.view);

    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBe(2);

    findNext(mounted.view);

    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBe(0);

    findPrevious(mounted.view);

    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBe(2);
    expect(mounted.view.state.selection.eq(selection)).toBe(true);
  });

  it("neither dirties the document nor enters history", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountDocument("leaf one, leaf two", onContentChanged);

    search(mounted, "leaf");
    findNext(mounted.view);
    changeSearchQuery(mounted.view, { caseSensitive: true, wholeWord: true });
    closeSearch(mounted.view);

    expect(onContentChanged).not.toHaveBeenCalled();
    expect(undoDepth(mounted.view.state)).toBe(0);
  });

  it("updates its matches as the document is edited", async () => {
    const mounted = await mountDocument("leaf one, leaf two");

    search(mounted, "leaf");
    findNext(mounted.view);
    const currentPosition = getCurrentPosition(mounted);

    mounted.view.dispatch(mounted.view.state.tr.insertText("leaf ", 1));

    expect(getSearchMatches(mounted.view.state)).toHaveLength(3);
    expect(getCurrentPosition(mounted)).toBe((currentPosition ?? 0) + 5);
    expect(getCurrentText(mounted)).toBe("leaf");

    const current = getCurrentPosition(mounted) ?? 0;

    mounted.view.dispatch(mounted.view.state.tr.delete(current + 1, current + 2));

    expect(getSearchMatches(mounted.view.state)).toHaveLength(2);
    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBeNull();
  });

  it("goes on from the caret once the author moves it", async () => {
    const mounted = await mountDocument("leaf one, leaf two, leaf three");

    search(mounted, "leaf");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "two"));

    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBeNull();

    findNext(mounted.view);

    expect(getCurrentPosition(mounted)).toBe(getEditorTextPosition(mounted, "leaf three"));
  });

  it("finds and replaces nothing for a query without matches", async () => {
    const mounted = await mountDocument("leaf one");
    const markdown = mounted.getMarkdown();

    search(mounted, "tree");

    expect(getSearchMatches(mounted.view.state)).toEqual([]);
    expect(findNext(mounted.view)).toBe(true);
    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBeNull();
    expect(replaceSearchMatch(mounted.view, "x")).toBe(true);
    expect(replaceAllSearchMatches(mounted.view, "x")).toBe(false);
    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it("replaces the current match with its formatting and moves on, one undo step each", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountDocument("**leaf** and 🌿leaf.", onContentChanged);

    search(mounted, "leaf");

    expect(replaceSearchMatch(mounted.view, "tree")).toBe(true);
    expect(mounted.getMarkdown()).toBe("**tree** and 🌿leaf.\n\nZ\n");
    expect(getCurrentPosition(mounted)).toBe(getEditorTextPosition(mounted, "leaf."));
    expect(onContentChanged).toHaveBeenCalled();

    replaceSearchMatch(mounted.view, "🍃");

    expect(mounted.getMarkdown()).toBe("**tree** and 🌿🍃.\n\nZ\n");

    undo(mounted.view);

    expect(mounted.getMarkdown()).toBe("**tree** and 🌿leaf.\n\nZ\n");
  });

  it("moves to a match before replacing when none is current", async () => {
    const mounted = await mountDocument("leaf one, leaf two");

    search(mounted, "leaf");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one"));
    replaceSearchMatch(mounted.view, "tree");

    expect(mounted.getMarkdown()).toBe("leaf one, leaf two\n\nZ\n");
    expect(getCurrentPosition(mounted)).toBe(getEditorTextPosition(mounted, "leaf two"));
  });

  it("replaces every match as one step to undo and redo", async () => {
    const mounted = await mountDocument("leaf Leaf\n\n- leaf\n\n> leaf");

    search(mounted, "leaf");

    expect(replaceAllSearchMatches(mounted.view, "tree")).toBe(true);
    expect(mounted.getMarkdown()).toBe("tree tree\n\n- tree\n\n> tree\n\nZ\n");
    expect(getSearchMatches(mounted.view.state)).toEqual([]);

    undo(mounted.view);

    expect(mounted.getMarkdown()).toBe("leaf Leaf\n\n- leaf\n\n> leaf\n\nZ\n");
    expect(getSearchMatches(mounted.view.state)).toHaveLength(4);

    redo(mounted.view);

    expect(mounted.getMarkdown()).toBe("tree tree\n\n- tree\n\n> tree\n\nZ\n");
    expect(undoDepth(mounted.view.state)).toBe(1);
  });

  it("replaces a link label without touching its destination", async () => {
    const mounted = await mountDocument("See [leaf notes](https://example.com/leaf) here.");

    search(mounted, "leaf");

    expect(getSearchMatches(mounted.view.state)).toHaveLength(1);

    replaceSearchMatch(mounted.view, "tree");

    expect(mounted.getMarkdown()).toBe("See [tree notes](https://example.com/leaf) here.\n\nZ\n");
  });

  it("keeps a link or code span whose whole text is replaced", async () => {
    const mounted = await mountDocument("A [leaf](https://example.com) and `leaf` here.");

    search(mounted, "leaf");
    replaceAllSearchMatches(mounted.view, "tree");

    expect(mounted.getMarkdown()).toBe("A [tree](https://example.com) and `tree` here.\n\nZ\n");
  });

  it("writes Markdown punctuation in a replacement as literal text", async () => {
    const mounted = await mountDocument("leaf and more");

    search(mounted, "leaf");
    replaceAllSearchMatches(mounted.view, "*x* [y]");

    const reopened = await mountEditor(mounted.getMarkdown());

    expect(reopened.view.state.doc.textContent).toBe("*x* [y] and moreZ");
    expect(reopened.root.querySelector("em")).toBeNull();
  });

  it("carries a reference definition's references along with its replaced destination", async () => {
    const mounted = await mountDocument(
      "See [the notes][ref] here.\n\n[ref]: https://leaf.example",
    );

    search(mounted, "leaf");
    replaceAllSearchMatches(mounted.view, "tree");

    expect(mounted.getMarkdown()).toBe(
      "See [the notes][ref] here.\n\n[ref]: https://tree.example\n\nZ\n",
    );
    expect(mounted.root.querySelector("a")?.getAttribute("href")).toBe("https://tree.example");
  });

  it("leaves an autolink's destination alone when its text is replaced", async () => {
    const mounted = await mountDocument("Visit https://leaf.example today.");

    search(mounted, "leaf");
    replaceAllSearchMatches(mounted.view, "tree");

    expect(mounted.getMarkdown()).toBe(
      "Visit [https://tree.example](https://leaf.example) today.\n\nZ\n",
    );
  });

  it("renames a footnote through its definition label", async () => {
    const mounted = await mountDocument("Text[^leaf].\n\n[^leaf]: Note.");

    search(mounted, "leaf");

    expect(getSearchMatches(mounted.view.state)).toHaveLength(1);

    replaceAllSearchMatches(mounted.view, "tree");

    expect(mounted.getMarkdown()).toBe("Text[^tree].\n\n[^tree]: Note.\n\nZ\n");
  });

  it("leaves the current match selected when it closes and keeps the query", async () => {
    const mounted = await mountDocument("leaf one, leaf two");

    search(mounted, "leaf");
    findNext(mounted.view);

    expect(closeSearch(mounted.view)).toBe(true);
    expect(getSearchState(mounted.view.state).open).toBe(false);
    expect(mounted.root.querySelector(`.${SEARCH_MATCH_CLASS}`)).toBeNull();
    expect(mounted.view.state.selection.from).toBe(getEditorTextPosition(mounted, "leaf two"));
    expect(getSelectedEditorText(mounted)).toBe("leaf");
    expect(canFindAdjacentMatch(mounted.view.state)).toBe(true);
  });

  it("leaves the caret where it was when it closes without a current match", async () => {
    const mounted = await mountDocument("leaf one");
    const { selection } = mounted.view.state;

    search(mounted, "tree");
    closeSearch(mounted.view);

    expect(mounted.view.state.selection.eq(selection)).toBe(true);
  });

  it("selects the adjacent match directly while the surface is closed", async () => {
    const mounted = await mountDocument("leaf one, leaf two");

    search(mounted, "leaf");
    closeSearch(mounted.view);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one"));

    expect(findNext(mounted.view)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(getEditorTextPosition(mounted, "leaf two"));
    expect(getSelectedEditorText(mounted)).toBe("leaf");

    findNext(mounted.view);

    expect(mounted.view.state.selection.from).toBe(getEditorTextPosition(mounted, "leaf one"));

    findPrevious(mounted.view);

    expect(mounted.view.state.selection.from).toBe(getEditorTextPosition(mounted, "leaf two"));
    expect(getSearchState(mounted.view.state).open).toBe(false);
  });

  it("highlights the matches around the current one and still reaches every match", async () => {
    const mounted = await mountDocument(Array.from({ length: 450 }, () => "leaf").join(" "));

    search(mounted, "leaf");

    expect(getSearchMatches(mounted.view.state)).toHaveLength(450);
    expect(getHighlightedTexts(mounted)).toHaveLength(200);

    findPrevious(mounted.view);

    expect(getCurrentSearchMatchIndex(mounted.view.state)).toBe(449);
    expect(getHighlightedTexts(mounted)).toHaveLength(201);
    expect(mounted.root.querySelectorAll(`.${CURRENT_SEARCH_MATCH_CLASS}`)).toHaveLength(1);
  });

  it("finalizes source projection before a search begins", async () => {
    const mounted = await mountDocument("Plain **bold leaf** text.");

    enterProjection(mounted, "strong");

    expect(mounted.view.state.doc.textContent).toContain("**");

    openSearch(mounted.view, "find");

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);

    changeSearchQuery(mounted.view, { query: "**" });

    expect(getSearchMatches(mounted.view.state)).toEqual([]);

    changeSearchQuery(mounted.view, { query: "leaf" });

    expect(getSearchMatches(mounted.view.state)).toHaveLength(1);
  });

  it("leaves the source of a projection opened during search out of its matches", async () => {
    const mounted = await mountDocument("Plain leaf and **bold leaf** text.");

    search(mounted, "leaf");

    expect(getSearchMatches(mounted.view.state)).toHaveLength(2);

    enterProjection(mounted, "strong");

    expect(getSearchMatches(mounted.view.state)).toHaveLength(1);
  });
});
