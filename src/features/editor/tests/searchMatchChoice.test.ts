// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getSelectedEditorText, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import {
  chooseSearchMatch,
  focusChosenSearchMatch,
  readDocumentSearchMatches,
} from "../commands/editing/search";
import { CHOSEN_SEARCH_MATCH_CLASS, getSearchState } from "../plugins/search";
import { hasActiveSourceProjection } from "../plugins/sourceProjection";
import {
  getSearchMatchContext,
  SEARCH_MATCH_CONTEXT_RADIUS,
  type TextSearchQuery,
} from "../utils/textSearch";

const mountEditor = setupMilkdownEditorMount();

const QUERY: TextSearchQuery = { caseSensitive: false, text: "leaf", wholeWord: false };

// The caret rests in a trailing plain paragraph, so no object opens its source under the search.
const mountDocument = async (markdown: string, onContextPopupRequested = vi.fn()) => {
  const mounted = await mountEditor(`${markdown}\n\nZ\n`, { onContextPopupRequested });

  setSelectionAtDocumentEnd(mounted.view);

  return mounted;
};

const targetFor = (mounted: MountedMilkdownEditor, ordinal: number) => {
  const { matches, text } = readDocumentSearchMatches(mounted.view, QUERY, {
    finalizeProjection: true,
  });

  return {
    ordinal,
    context: getSearchMatchContext(text, matches[ordinal], SEARCH_MATCH_CONTEXT_RADIUS),
  };
};

const getChosenText = (mounted: MountedMilkdownEditor) => {
  const { chosen } = getSearchState(mounted.view.state);

  return chosen && mounted.view.state.doc.textBetween(chosen.from, chosen.to);
};

const getChosenHighlights = (mounted: MountedMilkdownEditor) =>
  mounted.view.dom.querySelectorAll(`.${CHOSEN_SEARCH_MATCH_CLASS}`);

describe("choosing a match from outside the editor", () => {
  it("shows the match without moving the caret, opening its source, or raising the popup", async () => {
    const popup = vi.fn();
    const mounted = await mountDocument("One leaf.\n\nA [linked leaf](d.md) here.", popup);
    const caret = mounted.view.state.selection;

    expect(chooseSearchMatch(mounted.view, QUERY, targetFor(mounted, 1))).toBe(1);

    expect(mounted.view.state.selection.eq(caret)).toBe(true);
    expect(getChosenText(mounted)).toBe("leaf");
    expect(getChosenHighlights(mounted)).toHaveLength(1);
    expect(getChosenHighlights(mounted)[0].textContent).toBe("leaf");
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(popup).not.toHaveBeenCalled();
  });

  it("finds the match again after text before it changed", async () => {
    const mounted = await mountDocument("One leaf.\n\nTwo leaf.");
    const target = targetFor(mounted, 1);

    mounted.view.dispatch(mounted.view.state.tr.delete(1, 10));

    expect(chooseSearchMatch(mounted.view, QUERY, target)).toBe(0);

    const { chosen } = getSearchState(mounted.view.state);

    expect(getChosenText(mounted)).toBe("leaf");
    expect(mounted.view.state.doc.resolve(chosen!.from).parent.textContent).toBe("Two leaf.");
  });

  it("chooses nothing once the match's text is gone", async () => {
    const mounted = await mountDocument("One leaf.\n\nTwo leaf.");
    const target = targetFor(mounted, 1);
    const position = mounted.view.state.doc.content.size - 8;

    mounted.view.dispatch(mounted.view.state.tr.insertText("Three", position, position + 3));

    expect(chooseSearchMatch(mounted.view, QUERY, target)).toBeNull();
    expect(getSearchState(mounted.view.state).chosen).toBeNull();
  });

  it("follows edits around the match and ends on a press into the text", async () => {
    const mounted = await mountDocument("One leaf.");

    chooseSearchMatch(mounted.view, QUERY, targetFor(mounted, 0));
    mounted.view.dispatch(mounted.view.state.tr.insertText("Just ", 1));

    expect(getChosenText(mounted)).toBe("leaf");

    mounted.view.dom.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));

    expect(getSearchState(mounted.view.state).chosen).toBeNull();
  });

  it("selects the match when focus returns to the text, as closing the search surface does", async () => {
    const mounted = await mountDocument("A [linked leaf](d.md) here.");

    chooseSearchMatch(mounted.view, QUERY, targetFor(mounted, 0));
    focusChosenSearchMatch(mounted.view);

    expect(getSearchState(mounted.view.state).chosen).toBeNull();
    expect(getSelectedEditorText(mounted)).toBe("leaf");
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
  });

  it("selects the match when the text takes focus from the keyboard", async () => {
    const mounted = await mountDocument("One leaf.");

    chooseSearchMatch(mounted.view, QUERY, targetFor(mounted, 0));
    mounted.view.dom.dispatchEvent(new FocusEvent("focus"));

    expect(getSearchState(mounted.view.state).chosen).toBeNull();
    expect(getSelectedEditorText(mounted)).toBe("leaf");
  });
});

describe("reading the active document for a folder search", () => {
  it("leaves out an open projection unless asked to finish it", async () => {
    const mounted = await mountDocument("Plain leaf and **bold leaf**.");

    enterProjection(mounted, "strong");

    expect(
      readDocumentSearchMatches(mounted.view, QUERY, { finalizeProjection: false }).matches,
    ).toHaveLength(1);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(
      readDocumentSearchMatches(mounted.view, QUERY, { finalizeProjection: true }).matches,
    ).toHaveLength(2);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
  });
});
