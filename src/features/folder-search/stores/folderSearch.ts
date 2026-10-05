import { create } from "zustand";

import { getPathIdentityKey, PathSet } from "@/lib/path";

import type { FolderReplaceApplyState } from "../services/folderReplaceReport";
import type { FolderSearchResults } from "../services/folderSearchEngine";

/** One match of the current results, named by its file and its place among the file's matches. */
export interface FolderSearchMatchKey {
  path: string;
  ordinal: number;
}

export type FolderSearchField = "query" | "replacement";

export interface FolderSearchState {
  open: boolean;
  /** Increases each time a field should take focus. */
  focusRequestId: number;
  focusTarget: FolderSearchField;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  /** Whether the replace row shows, which makes the search plan replacing every match. */
  replaceOpen: boolean;
  replacement: string;
  apply: FolderReplaceApplyState;
  results: FolderSearchResults | null;
  collapsedPaths: PathSet;
  /** Matches of the current results found gone when chosen, by {@link getMatchIdentity}. */
  unavailableMatches: ReadonlySet<string>;
  chosenMatch: FolderSearchMatchKey | null;
}

export interface FolderSearchStore extends FolderSearchState {
  openFolderSearch: (mode?: "find" | "replace") => void;
  closeFolderSearch: () => void;
  setQuery: (query: string) => void;
  setCaseSensitive: (caseSensitive: boolean) => void;
  setWholeWord: (wholeWord: boolean) => void;
  setReplaceOpen: (replaceOpen: boolean) => void;
  setReplacement: (replacement: string) => void;
  setApplyState: (apply: FolderReplaceApplyState) => void;
  setResults: (results: FolderSearchResults | null) => void;
  toggleFileCollapsed: (path: string) => void;
  markMatchUnavailable: (match: FolderSearchMatchKey) => void;
  setChosenMatch: (match: FolderSearchMatchKey | null) => void;
  reset: () => void;
}

export const getMatchIdentity = ({ ordinal, path }: FolderSearchMatchKey) =>
  `${getPathIdentityKey(path)}\u0000${ordinal}`;

const EMPTY_MATCHES: ReadonlySet<string> = new Set();

const IDLE_APPLY: FolderReplaceApplyState = { status: "idle" };

const INITIAL_FOLDER_SEARCH_STATE: FolderSearchState = {
  open: false,
  focusRequestId: 0,
  focusTarget: "query",
  query: "",
  caseSensitive: false,
  wholeWord: false,
  replaceOpen: false,
  replacement: "",
  apply: IDLE_APPLY,
  results: null,
  collapsedPaths: new PathSet(),
  unavailableMatches: EMPTY_MATCHES,
  chosenMatch: null,
};

// An Apply's report stays until the author changes what the next Apply would do, while an Apply in
// progress keeps its own state until it ends.
const changedPlan = (state: FolderSearchState): Partial<FolderSearchState> =>
  state.apply.status === "done" ? { apply: IDLE_APPLY } : {};

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

  openFolderSearch: (mode = "find") =>
    set((state) => {
      const replaceOpen = mode === "replace" || state.replaceOpen;

      return {
        open: true,
        replaceOpen,
        focusRequestId: state.focusRequestId + 1,
        focusTarget: mode === "replace" && state.query !== "" ? "replacement" : "query",
      };
    }),
  closeFolderSearch: () =>
    set((state) => ({ open: false, ...CLOSED_RESULTS, ...changedPlan(state) })),
  setQuery: (query) => set((state) => ({ query, ...changedPlan(state) })),
  setCaseSensitive: (caseSensitive) => set((state) => ({ caseSensitive, ...changedPlan(state) })),
  setWholeWord: (wholeWord) => set((state) => ({ wholeWord, ...changedPlan(state) })),
  setReplaceOpen: (replaceOpen) => set((state) => ({ replaceOpen, ...changedPlan(state) })),
  setReplacement: (replacement) => set((state) => ({ replacement, ...changedPlan(state) })),
  setApplyState: (apply) => set({ apply }),
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
    set((state) => ({
      ...INITIAL_FOLDER_SEARCH_STATE,
      focusRequestId: state.focusRequestId,
      // An Apply in progress finishes and reports, even once its folder closes.
      apply: state.apply.status === "applying" ? state.apply : IDLE_APPLY,
    })),
}));
