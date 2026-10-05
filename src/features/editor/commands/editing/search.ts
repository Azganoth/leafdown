import { closeHistory } from "@milkdown/kit/prose/history";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

import { revealFoldedRange } from "../../plugins/headingFold";
import {
  findSearchMatches,
  getCurrentSearchMatchIndex,
  getSearchMatches,
  getSearchState,
  getSearchTextQuery,
  setSearchClosed,
  setSearchUpdate,
  takeChosenSearchMatch,
  type SearchMode,
  type SearchQueryChange,
  type SearchUpdate,
} from "../../plugins/search";
import {
  finalizeSourceProjection,
  getActiveSourceProjectionRange,
  hasActiveSourceProjection,
} from "../../plugins/sourceProjection";
import type { TextRange } from "../../utils/textRanges";
import {
  planStateReplacement,
  replaceTextRange,
  replaceTextRanges,
  settleStateForSave,
  type DocumentReplacementPlan,
} from "../../utils/textReplacement";
import {
  findDocumentTextMatches,
  findMatchIndexBefore,
  findMatchIndexFrom,
  findSearchMatchTarget,
  findTextMatches,
  getSearchableText,
  type DocumentSearchMatches,
  type SearchMatchTarget,
  type TextSearchQuery,
} from "../../utils/textSearch";

type Direction = 1 | -1;

// A query is one run of text, so only a selection within one run can become one.
const getSelectionQuery = (state: EditorState) => {
  const { selection } = state;

  if (!(selection instanceof TextSelection) || selection.empty) {
    return null;
  }

  const { $from, $to } = selection;

  if (!$from.sameParent($to) || !$from.parent.isTextblock) {
    return null;
  }

  let spansInlineNode = false;

  state.doc.nodesBetween(selection.from, selection.to, (node) => {
    spansInlineNode ||= node.isInline && !node.isText;
  });

  const text = state.doc.textBetween(selection.from, selection.to);

  return spansInlineNode || text.includes("\n") ? null : text;
};

const dispatchSearchUpdate = (view: EditorView, update: SearchUpdate) => {
  view.dispatch(setSearchUpdate(view.state.tr, update));

  return true;
};

const findAdjacentIndex = (
  matches: readonly TextRange[],
  { from, to }: TextRange,
  direction: Direction,
) => (direction === 1 ? findMatchIndexFrom(matches, to) : findMatchIndexBefore(matches, from));

const getMatch = (matches: readonly TextRange[], index: number | null) =>
  index === null ? null : matches[index];

export const openSearch = (view: EditorView, mode: SearchMode) => {
  finalizeSourceProjection(view);

  const { state } = view;
  const search = getSearchState(state);
  const selectionQuery = getSelectionQuery(state);
  const query = selectionQuery ?? search.query;
  const matches = findSearchMatches(state, { ...search, query });
  // Asking again for a surface already open only brings focus back to it, and `Find...` leaves a
  // replace row that is showing where it is.
  const current =
    search.open && selectionQuery === null
      ? search.current
      : getMatch(matches, findMatchIndexFrom(matches, state.selection.from));

  return dispatchSearchUpdate(view, {
    change: {
      current,
      mode: search.open && mode === "find" ? search.mode : mode,
      open: true,
      query,
    },
    focus: mode === "replace" && query !== "" ? "replacement" : "query",
    reveal: true,
  });
};

export const setSearchMode = (view: EditorView, mode: SearchMode) =>
  dispatchSearchUpdate(view, { change: { mode } });

// A refined query goes on from the match it had reached rather than back to the caret.
export const changeSearchQuery = (view: EditorView, change: SearchQueryChange) => {
  finalizeSourceProjection(view);

  const { state } = view;
  const search = getSearchState(state);
  const matches = findSearchMatches(state, { ...search, ...change });
  const position = search.current?.from ?? state.selection.from;

  return dispatchSearchUpdate(view, {
    change: { ...change, current: getMatch(matches, findMatchIndexFrom(matches, position)) },
    reveal: true,
  });
};

export const canFindAdjacentMatch = (state: EditorState) => getSearchState(state).query !== "";

const moveToAdjacentMatch = (view: EditorView, direction: Direction) => {
  const { state } = view;
  const matches = getSearchMatches(state);
  const current = getCurrentSearchMatchIndex(state);
  const next =
    current === null
      ? findAdjacentIndex(matches, state.selection, direction)
      : (current + direction + matches.length) % matches.length;

  if (next === null) {
    return true;
  }

  return dispatchSearchUpdate(view, { change: { current: matches[next] }, reveal: true });
};

// With the surface closed there are no highlights to move, so the match itself is selected, as
// closing the surface on it would have left it.
const selectAdjacentMatch = (view: EditorView, direction: Direction) => {
  const { state } = view;
  const matches = findSearchMatches(state, getSearchState(state));
  const match = getMatch(matches, findAdjacentIndex(matches, state.selection, direction));

  if (!match) {
    return false;
  }

  view.focus();
  view.dispatch(
    state.tr.setSelection(TextSelection.create(state.doc, match.from, match.to)).scrollIntoView(),
  );

  return true;
};

const findAdjacentMatch = (view: EditorView, direction: Direction) => {
  if (!canFindAdjacentMatch(view.state)) {
    return false;
  }

  finalizeSourceProjection(view);

  return getSearchState(view.state).open
    ? moveToAdjacentMatch(view, direction)
    : selectAdjacentMatch(view, direction);
};

export const findNext = (view: EditorView) => findAdjacentMatch(view, 1);

export const findPrevious = (view: EditorView) => findAdjacentMatch(view, -1);

// Replacing edits canonical text, so a projection that could not settle leaves nothing to replace.
const getReplaceableMatches = (view: EditorView) => {
  finalizeSourceProjection(view);

  const search = getSearchState(view.state);

  return search.open && search.query !== "" && !hasActiveSourceProjection(view.state)
    ? getSearchMatches(view.state)
    : null;
};

/** Replaces the current match and moves on; without one, only moves to the next match. */
export const replaceSearchMatch = (view: EditorView, replacement: string) => {
  const matches = getReplaceableMatches(view);

  if (!matches) {
    return false;
  }

  const match = getMatch(matches, getCurrentSearchMatchIndex(view.state));

  if (!match) {
    return moveToAdjacentMatch(view, 1);
  }

  // Each replacement is its own step to undo, even straight after typing.
  const transaction = replaceTextRange(closeHistory(view.state.tr), match, replacement);
  const remaining = findTextMatches(
    transaction.doc,
    getSearchTextQuery(getSearchState(view.state)),
  );
  const next = findMatchIndexFrom(remaining, transaction.mapping.map(match.to));

  view.dispatch(
    setSearchUpdate(transaction, { change: { current: getMatch(remaining, next) }, reveal: true }),
  );

  return true;
};

export const replaceAllSearchMatches = (view: EditorView, replacement: string) => {
  const matches = getReplaceableMatches(view);

  if (!matches || matches.length === 0) {
    return false;
  }

  const transaction = replaceTextRanges(closeHistory(view.state.tr), matches, replacement);

  view.dispatch(setSearchUpdate(transaction, { change: { current: null } }));

  return true;
};

/** The active document's matches for a search of its folder, as the document Find would read them. */
export const readDocumentSearchMatches = (
  view: EditorView,
  query: TextSearchQuery,
  { finalizeProjection }: { finalizeProjection: boolean },
): DocumentSearchMatches => {
  if (finalizeProjection) {
    finalizeSourceProjection(view);
  }

  const searchable = getSearchableText(view.state.doc);

  return {
    text: searchable.text,
    matches: findDocumentTextMatches(
      searchable,
      query,
      getActiveSourceProjectionRange(view.state),
    ).map(({ offsets }) => offsets),
  };
};

/** What replacing every match of a folder search would make of the document, dispatching nothing. */
export const planSearchReplacement = (
  view: EditorView,
  query: TextSearchQuery,
  replacement: string,
  serialize: (doc: ProseMirrorNode) => string,
): DocumentReplacementPlan => planStateReplacement(view.state, query, replacement, serialize);

/**
 * Replaces every match as one step to undo, but only while the document still reads as the
 * Markdown a plan was made from. Returns the number of matches replaced, or `null` when the
 * document changed or a projection could not settle.
 */
export const applySearchReplacement = (
  view: EditorView,
  query: TextSearchQuery,
  replacement: string,
  baseline: string,
  serialize: (doc: ProseMirrorNode) => string,
) => {
  if (serialize(settleStateForSave(view.state).doc) !== baseline) {
    return null;
  }

  finalizeSourceProjection(view);

  if (hasActiveSourceProjection(view.state)) {
    return null;
  }

  const matches = findTextMatches(view.state.doc, query);

  if (matches.length > 0) {
    view.dispatch(replaceTextRanges(closeHistory(view.state.tr), matches, replacement));
  }

  return matches.length;
};

/**
 * Shows a match chosen outside the editor while focus stays where the choice was made, returning
 * its place among the document's matches. Like a match visited from the open search surface, it
 * moves no caret and opens nothing until the editor takes focus, which selects it.
 */
export const chooseSearchMatch = (
  view: EditorView,
  query: TextSearchQuery,
  target: SearchMatchTarget,
) => {
  finalizeSourceProjection(view);

  const searchable = getSearchableText(view.state.doc);
  const matches = findDocumentTextMatches(searchable, query);
  const index = findSearchMatchTarget(
    searchable.text,
    matches.map(({ offsets }) => offsets),
    target,
  );

  if (index === null) {
    return null;
  }

  const { range } = matches[index];
  const transaction = revealFoldedRange(view.state.tr, range.from, range.to);

  view.dispatch(setSearchUpdate(transaction, { change: { chosen: range }, reveal: true }));

  return index;
};

/** Returns focus to the text with a chosen match selected, as closing the search surface does. */
export const focusChosenSearchMatch = (view: EditorView) => {
  takeChosenSearchMatch(view);
  view.focus();
};

/** Leaves the current match selected, or the caret where it was, and returns focus to the text. */
export const closeSearch = (view: EditorView) => {
  const { state } = view;

  if (!getSearchState(state).open) {
    return false;
  }

  const match = getMatch(getSearchMatches(state), getCurrentSearchMatchIndex(state));
  const transaction = setSearchClosed(state.tr);

  if (match) {
    transaction
      .setSelection(TextSelection.create(transaction.doc, match.from, match.to))
      .scrollIntoView();
  }

  view.focus();
  view.dispatch(transaction);

  return true;
};
