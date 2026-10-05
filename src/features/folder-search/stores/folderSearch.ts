import { create } from "zustand";

import { getPathIdentityKey, PathSet } from "@/lib/path";

import type { FolderSearchResults } from "../services/folderSearchEngine";

/** One match of the current results, named by its file and its place among the file's matches. */
export interface FolderSearchMatchKey {
  path: string;
  ordinal: number;
}

export interface FolderSearchState {
  open: boolean;
  /** Increases each time the query field should take focus. */
  focusRequestId: number;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  results: FolderSearchResults | null;
  collapsedPaths: PathSet;
  /** Matches of the current results found gone when chosen, by {@link getMatchIdentity}. */
  unavailableMatches: ReadonlySet<string>;
  chosenMatch: FolderSearchMatchKey | null;
}

export interface FolderSearchStore extends FolderSearchState {
  openFolderSearch: () => void;
  closeFolderSearch: () => void;
  setQuery: (query: string) => void;
  setCaseSensitive: (caseSensitive: boolean) => void;
  setWholeWord: (wholeWord: boolean) => void;
  setResults: (results: FolderSearchResults | null) => void;
  toggleFileCollapsed: (path: string) => void;
  markMatchUnavailable: (match: FolderSearchMatchKey) => void;
  setChosenMatch: (match: FolderSearchMatchKey | null) => void;
  reset: () => void;
}

export const getMatchIdentity = ({ ordinal, path }: FolderSearchMatchKey) =>
  `${getPathIdentityKey(path)}\u0000${ordinal}`;

const EMPTY_MATCHES: ReadonlySet<string> = new Set();

const INITIAL_FOLDER_SEARCH_STATE: FolderSearchState = {
  open: false,
  focusRequestId: 0,
  query: "",
  caseSensitive: false,
  wholeWord: false,
  results: null,
  collapsedPaths: new PathSet(),
  unavailableMatches: EMPTY_MATCHES,
  chosenMatch: null,
};

// Results are read afresh for every opening, while the query and its options are kept for the
// folder until it closes.
const CLOSED_RESULTS = {
  results: null,
  collapsedPaths: new PathSet(),
  unavailableMatches: EMPTY_MATCHES,
  chosenMatch: null,
} satisfies Partial<FolderSearchState>;

// A file searched again may number its matches differently, so marks on its old matches go.
const keepMarksOfUnchangedFiles = (
  state: FolderSearchState,
  results: FolderSearchResults,
): Pick<FolderSearchState, "chosenMatch" | "unavailableMatches"> => {
  if (state.unavailableMatches.size === 0 && !state.chosenMatch) {
    return { chosenMatch: null, unavailableMatches: state.unavailableMatches };
  }

  const unchanged = new PathSet();
  const previous = new Map(
    state.results?.files.map((file) => [getPathIdentityKey(file.path), file]),
  );

  for (const file of results.files) {
    if (previous.get(getPathIdentityKey(file.path)) === file) {
      unchanged.add(file.path);
    }
  }

  const unavailableMatches = new Set(
    [...state.unavailableMatches].filter((identity) => unchanged.has(identity.split("\u0000")[0])),
  );

  return {
    chosenMatch:
      state.chosenMatch && unchanged.has(state.chosenMatch.path) ? state.chosenMatch : null,
    unavailableMatches,
  };
};

export const useFolderSearchStore = create<FolderSearchStore>()((set) => ({
  ...INITIAL_FOLDER_SEARCH_STATE,

  openFolderSearch: () =>
    set((state) => ({ open: true, focusRequestId: state.focusRequestId + 1 })),
  closeFolderSearch: () => set({ open: false, ...CLOSED_RESULTS }),
  setQuery: (query) => set({ query }),
  setCaseSensitive: (caseSensitive) => set({ caseSensitive }),
  setWholeWord: (wholeWord) => set({ wholeWord }),
  setResults: (results) =>
    set((state) =>
      results && results.id === state.results?.id
        ? { results, ...keepMarksOfUnchangedFiles(state, results) }
        : { ...CLOSED_RESULTS, results },
    ),
  toggleFileCollapsed: (path) =>
    set((state) => {
      const collapsedPaths = new PathSet(state.collapsedPaths);

      if (!collapsedPaths.delete(path)) {
        collapsedPaths.add(path);
      }

      return { collapsedPaths };
    }),
  markMatchUnavailable: (match) =>
    set((state) => ({
      unavailableMatches: new Set(state.unavailableMatches).add(getMatchIdentity(match)),
    })),
  setChosenMatch: (chosenMatch) => set({ chosenMatch }),
  reset: () =>
    set((state) => ({ ...INITIAL_FOLDER_SEARCH_STATE, focusRequestId: state.focusRequestId })),
}));
