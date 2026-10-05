import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import type { TextRange } from "../utils/textRanges";
import { findMatchIndexFrom, findTextMatches, type TextSearchQuery } from "../utils/textSearch";
import { revealFoldedRange } from "./headingFold";
import {
  getActiveSourceProjectionRange,
  SOURCE_PROJECTION_ENTRY_SUPPRESSION_META,
} from "./sourceProjection";

export type SearchMode = "find" | "replace";

export interface SearchFocusRequest {
  id: number;
  target: "query" | "replacement";
}

/** What the search surface shows, read from the editor rather than kept beside it. */
export interface EditorSearchState {
  caseSensitive: boolean;
  currentIndex: number | null;
  focusRequest: SearchFocusRequest | null;
  matchCount: number;
  mode: SearchMode;
  open: boolean;
  query: string;
  wholeWord: boolean;
}

export interface LeafdownSearchPluginOptions {
  onStateChanged?: (state: EditorSearchState) => void;
}

// The matches are derived from the document, the query, and the projection plugin's state, which
// a plugin's own `apply` cannot see settled. Only what the author chose is kept here, with the
// current match as a range that follows the text it covers.
interface SearchPluginState {
  caseSensitive: boolean;
  current: TextRange | null;
  /** A match chosen from outside the editor, shown until the editor takes it or a pointer press. */
  chosen: TextRange | null;
  focusRequest: SearchFocusRequest | null;
  mode: SearchMode;
  open: boolean;
  query: string;
  /** Counts the moves that should bring the current match into view. */
  revealed: number;
  wholeWord: boolean;
}

export type SearchQueryChange = Partial<
  Pick<SearchPluginState, "caseSensitive" | "query" | "wholeWord">
>;

export interface SearchUpdate {
  change: Partial<
    Pick<
      SearchPluginState,
      "caseSensitive" | "chosen" | "current" | "mode" | "open" | "query" | "wholeWord"
    >
  >;
  focus?: SearchFocusRequest["target"];
  reveal?: boolean;
}

export const CLOSED_EDITOR_SEARCH_STATE: EditorSearchState = {
  caseSensitive: false,
  currentIndex: null,
  focusRequest: null,
  matchCount: 0,
  mode: "find",
  open: false,
  query: "",
  wholeWord: false,
};

export const SEARCH_MATCH_CLASS = "leafdown-search-match";
export const CURRENT_SEARCH_MATCH_CLASS = "leafdown-search-match--current";
export const CHOSEN_SEARCH_MATCH_CLASS = "leafdown-search-match--chosen";

// Highlights are drawn for the matches around the current one. Building a decoration set costs its
// size times the document's top-level blocks, which at the 5 MB load limit is about 30 ms for 400
// highlights and 160 ms for 2,000. Every match stays reachable whether or not it is highlighted.
const HIGHLIGHT_RADIUS = 200;

const NO_MATCHES: readonly TextRange[] = [];

const INITIAL_SEARCH_STATE: SearchPluginState = {
  caseSensitive: false,
  chosen: null,
  current: null,
  focusRequest: null,
  mode: "find",
  open: false,
  query: "",
  revealed: 0,
  wholeWord: false,
};

export const leafdownSearchPluginKey = new PluginKey<SearchPluginState>("leafdownSearch");

export const getSearchState = (state: EditorState) =>
  leafdownSearchPluginKey.getState(state) ?? INITIAL_SEARCH_STATE;

export const getSearchTextQuery = ({
  caseSensitive,
  query,
  wholeWord,
}: Pick<SearchPluginState, "caseSensitive" | "query" | "wholeWord">): TextSearchQuery => ({
  caseSensitive,
  text: query,
  wholeWord,
});

interface CachedMatches {
  key: string;
  matches: readonly TextRange[];
}

// A selection change keeps the document, so the matches are found once per document and query.
const matchCache = new WeakMap<ProseMirrorNode, CachedMatches>();

// Projected source is transient text standing in for an object, so it is not searched as though
// the file held it.
export const findSearchMatches = (
  state: EditorState,
  query: Pick<SearchPluginState, "caseSensitive" | "query" | "wholeWord">,
): readonly TextRange[] => {
  if (query.query === "") {
    return NO_MATCHES;
  }

  const excluded = getActiveSourceProjectionRange(state);
  const key = JSON.stringify([
    query.query,
    query.caseSensitive,
    query.wholeWord,
    excluded?.from,
    excluded?.to,
  ]);
  const cached = matchCache.get(state.doc);

  if (cached?.key === key) {
    return cached.matches;
  }

  const matches = findTextMatches(state.doc, getSearchTextQuery(query), excluded);

  matchCache.set(state.doc, { key, matches });

  return matches;
};

export const getSearchMatches = (state: EditorState) => {
  const search = getSearchState(state);

  return search.open ? findSearchMatches(state, search) : NO_MATCHES;
};

/** The current match's place among the matches, or `null` once its text no longer matches. */
export const getCurrentSearchMatchIndex = (state: EditorState) => {
  const { current } = getSearchState(state);

  if (!current) {
    return null;
  }

  const index = getSearchMatches(state).findIndex(
    (match) => match.from === current.from && match.to === current.to,
  );

  return index === -1 ? null : index;
};

// Search reads and moves through the document without touching the caret, so none of its own
// transactions is a reason for the caret's object to open its source.
export const setSearchUpdate = (transaction: Transaction, update: SearchUpdate) => {
  const { current } = update.change;
  if (update.reveal && current) revealFoldedRange(transaction, current.from, current.to);
  return transaction
    .setMeta(leafdownSearchPluginKey, update)
    .setMeta(SOURCE_PROJECTION_ENTRY_SUPPRESSION_META, true);
};

// Closing hands the match to the caret, which opens its source there as any caret would.
export const setSearchClosed = (transaction: Transaction) =>
  transaction.setMeta(leafdownSearchPluginKey, {
    change: { current: null, open: false },
  } satisfies SearchUpdate);

// An edit carries the current match along with the text it covers, and a caret the author places
// elsewhere takes over from it, so `Find next` goes on from the caret instead.
const mapRange = (transaction: Transaction, range: TextRange): TextRange | null => {
  const from = transaction.mapping.map(range.from, 1);
  const to = transaction.mapping.map(range.to, -1);

  return from < to ? { from, to } : null;
};

const applyCurrentMatch = (
  transaction: Transaction,
  value: SearchPluginState,
): SearchPluginState => {
  if (!value.open || !value.current) {
    return value;
  }

  if (transaction.selectionSet) {
    return { ...value, current: null };
  }

  if (!transaction.docChanged) {
    return value;
  }

  return { ...value, current: mapRange(transaction, value.current) };
};

// The chosen match does not follow the selection, which source projection moves on its own as a
// document opens; it ends when the editor takes it or the author presses into the text.
const applyChosenMatch = (transaction: Transaction, value: SearchPluginState): SearchPluginState =>
  value.chosen && transaction.docChanged
    ? { ...value, chosen: mapRange(transaction, value.chosen) }
    : value;

/** Makes the chosen match the selection, which opens its source or the popup as a selection would. */
export const takeChosenSearchMatch = (view: EditorView) => {
  const { chosen } = getSearchState(view.state);

  if (!chosen) {
    return false;
  }

  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, chosen.from, chosen.to))
      .setMeta(leafdownSearchPluginKey, { change: { chosen: null } } satisfies SearchUpdate),
  );

  return true;
};

const dropChosenSearchMatch = (view: EditorView) => {
  if (getSearchState(view.state).chosen) {
    view.dispatch(
      view.state.tr.setMeta(leafdownSearchPluginKey, {
        change: { chosen: null },
      } satisfies SearchUpdate),
    );
  }

  return false;
};

const applySearchTransaction = (
  transaction: Transaction,
  value: SearchPluginState,
): SearchPluginState => {
  const update = transaction.getMeta(leafdownSearchPluginKey) as SearchUpdate | undefined;

  if (update) {
    const chosen = Object.hasOwn(update.change, "chosen")
      ? (update.change.chosen ?? null)
      : applyChosenMatch(transaction, value).chosen;

    return {
      ...value,
      ...update.change,
      chosen,
      focusRequest: update.focus
        ? { id: (value.focusRequest?.id ?? 0) + 1, target: update.focus }
        : value.focusRequest,
      revealed: update.reveal ? value.revealed + 1 : value.revealed,
    };
  }

  return applyChosenMatch(transaction, applyCurrentMatch(transaction, value));
};

/** Highlights for the matches around the one at `center`, each with the class `getClass` names. */
export const createBoundedMatchDecorations = (
  document: ProseMirrorNode,
  matches: readonly TextRange[],
  center: number,
  getClass: (index: number) => string,
) => {
  const start = Math.max(0, center - HIGHLIGHT_RADIUS);
  const end = Math.min(matches.length, center + HIGHLIGHT_RADIUS);
  const decorations: Decoration[] = [];

  for (let index = start; index < end; index += 1) {
    const { from, to } = matches[index];

    decorations.push(Decoration.inline(from, to, { class: getClass(index) }));
  }

  return DecorationSet.create(document, decorations);
};

const createSearchDecorations = (
  document: ProseMirrorNode,
  matches: readonly TextRange[],
  current: number | null,
  center: number,
) =>
  createBoundedMatchDecorations(document, matches, center, (index) =>
    index === current ? `${SEARCH_MATCH_CLASS} ${CURRENT_SEARCH_MATCH_CLASS}` : SEARCH_MATCH_CLASS,
  );

export const getEditorSearchState = (state: EditorState): EditorSearchState => {
  const search = getSearchState(state);

  return {
    caseSensitive: search.caseSensitive,
    currentIndex: getCurrentSearchMatchIndex(state),
    focusRequest: search.focusRequest,
    matchCount: getSearchMatches(state).length,
    mode: search.mode,
    open: search.open,
    query: search.query,
    wholeWord: search.wholeWord,
  };
};

const areEditorSearchStatesEqual = (left: EditorSearchState, right: EditorSearchState) =>
  (Object.keys(left) as (keyof EditorSearchState)[]).every((key) => left[key] === right[key]);

// A match chosen from another surface may sit anywhere in a document just opened, so it is brought
// to the middle of the view rather than to the nearest edge.
const revealCurrentMatch = (view: EditorView) => {
  const chosen = getSearchState(view.state).chosen !== null;

  view.dom
    .querySelector(`.${chosen ? CHOSEN_SEARCH_MATCH_CLASS : CURRENT_SEARCH_MATCH_CLASS}`)
    ?.scrollIntoView?.({ block: chosen ? "center" : "nearest", inline: "nearest" });
};

export const createLeafdownSearchPlugin = (options: LeafdownSearchPluginOptions = {}) =>
  $prose(() => {
    let decorationCache: {
      center: number;
      current: number | null;
      decorations: DecorationSet;
      document: ProseMirrorNode;
      matches: readonly TextRange[];
    } | null = null;

    let chosenDecorationCache: {
      base: DecorationSet | null;
      chosen: TextRange;
      decorations: DecorationSet;
      document: ProseMirrorNode;
    } | null = null;

    const getDecorations = (state: EditorState) => {
      const base = getMatchDecorations(state);
      const { chosen } = getSearchState(state);

      if (!chosen) {
        return base;
      }

      if (
        chosenDecorationCache?.document !== state.doc ||
        chosenDecorationCache.chosen !== chosen ||
        chosenDecorationCache.base !== base
      ) {
        const decoration = Decoration.inline(chosen.from, chosen.to, {
          class: `${SEARCH_MATCH_CLASS} ${CHOSEN_SEARCH_MATCH_CLASS}`,
        });

        chosenDecorationCache = {
          base,
          chosen,
          decorations: base
            ? base.add(state.doc, [decoration])
            : DecorationSet.create(state.doc, [decoration]),
          document: state.doc,
        };
      }

      return chosenDecorationCache.decorations;
    };

    const getMatchDecorations = (state: EditorState) => {
      const matches = getSearchMatches(state);

      if (matches.length === 0) {
        return null;
      }

      const current = getCurrentSearchMatchIndex(state);
      const center = current ?? findMatchIndexFrom(matches, state.selection.from) ?? 0;

      if (
        decorationCache?.document !== state.doc ||
        decorationCache.matches !== matches ||
        decorationCache.current !== current ||
        decorationCache.center !== center
      ) {
        decorationCache = {
          center,
          current,
          decorations: createSearchDecorations(state.doc, matches, current, center),
          document: state.doc,
          matches,
        };
      }

      return decorationCache.decorations;
    };

    return new Plugin<SearchPluginState>({
      key: leafdownSearchPluginKey,
      state: {
        init: () => INITIAL_SEARCH_STATE,
        apply: (transaction, value) => applySearchTransaction(transaction, value),
      },
      props: {
        decorations: getDecorations,
        // A press places the caret where it lands, so it drops the match before focus arrives;
        // focus from the keyboard finds the match still chosen and takes it.
        handleDOMEvents: {
          focus: (view) => {
            takeChosenSearchMatch(view);
            return false;
          },
          mousedown: dropChosenSearchMatch,
        },
      },
      view: (editorView) => {
        let published = getEditorSearchState(editorView.state);
        let revealFrame = 0;

        return {
          update: (view, previousState) => {
            const search = getSearchState(view.state);

            // Revealed a frame later, once the surface that opened with this move has made room
            // above the document for a match at its very top.
            if (search.revealed !== getSearchState(previousState).revealed) {
              window.cancelAnimationFrame(revealFrame);
              revealFrame = window.requestAnimationFrame(() => {
                if (!view.isDestroyed) {
                  revealCurrentMatch(view);
                }
              });
            }

            const next = getEditorSearchState(view.state);

            if (!areEditorSearchStatesEqual(published, next)) {
              published = next;
              options.onStateChanged?.(next);
            }
          },
          destroy: () => window.cancelAnimationFrame(revealFrame),
        };
      },
    });
  });
