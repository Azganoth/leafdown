import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
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
    Pick<SearchPluginState, "caseSensitive" | "current" | "mode" | "open" | "query" | "wholeWord">
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

// Highlights are drawn for the matches around the current one. Building a decoration set costs its
// size times the document's top-level blocks, which at the 5 MB load limit is about 30 ms for 400
// highlights and 160 ms for 2,000. Every match stays reachable whether or not it is highlighted.
const HIGHLIGHT_RADIUS = 200;

const NO_MATCHES: readonly TextRange[] = [];

const INITIAL_SEARCH_STATE: SearchPluginState = {
  caseSensitive: false,
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
const applySearchTransaction = (
  transaction: Transaction,
  value: SearchPluginState,
): SearchPluginState => {
  const update = transaction.getMeta(leafdownSearchPluginKey) as SearchUpdate | undefined;

  if (update) {
    return {
      ...value,
      ...update.change,
      focusRequest: update.focus
        ? { id: (value.focusRequest?.id ?? 0) + 1, target: update.focus }
        : value.focusRequest,
      revealed: update.reveal ? value.revealed + 1 : value.revealed,
    };
  }

  if (!value.open || !value.current) {
    return value;
  }

  if (transaction.selectionSet) {
    return { ...value, current: null };
  }

  if (!transaction.docChanged) {
    return value;
  }

  const from = transaction.mapping.map(value.current.from, 1);
  const to = transaction.mapping.map(value.current.to, -1);

  return { ...value, current: from < to ? { from, to } : null };
};

const createSearchDecorations = (
  document: ProseMirrorNode,
  matches: readonly TextRange[],
  current: number | null,
  center: number,
) => {
  const start = Math.max(0, center - HIGHLIGHT_RADIUS);
  const end = Math.min(matches.length, center + HIGHLIGHT_RADIUS);
  const decorations: Decoration[] = [];

  for (let index = start; index < end; index += 1) {
    const { from, to } = matches[index];

    decorations.push(
      Decoration.inline(from, to, {
        class:
          index === current
            ? `${SEARCH_MATCH_CLASS} ${CURRENT_SEARCH_MATCH_CLASS}`
            : SEARCH_MATCH_CLASS,
      }),
    );
  }

  return DecorationSet.create(document, decorations);
};

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

const revealCurrentMatch = (view: EditorView) => {
  view.dom
    .querySelector(`.${CURRENT_SEARCH_MATCH_CLASS}`)
    ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
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

    const getDecorations = (state: EditorState) => {
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
