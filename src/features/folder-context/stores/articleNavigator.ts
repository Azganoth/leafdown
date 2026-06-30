import { create } from "zustand";

import { isSamePath, PathSet } from "@/lib/path";

export interface ArticleNavigatorState {
  expandedDirectoryPaths: string[];
  revealArticlePath: string | null;
  revealRequestId: number;
}

export interface ArticleNavigatorStore extends ArticleNavigatorState {
  collapseAll: () => void;
  expandDirectories: (paths: string[]) => void;
  requestRevealArticle: (articlePath: string, ancestorDirectoryPaths: string[]) => void;
  reset: () => void;
  setDirectoryExpanded: (path: string, expanded: boolean) => void;
  toggleDirectory: (path: string) => void;
}

const INITIAL_ARTICLE_NAVIGATOR_STATE: ArticleNavigatorState = {
  expandedDirectoryPaths: [],
  revealArticlePath: null,
  revealRequestId: 0,
};

const addUniquePaths = (currentPaths: string[], paths: string[]) => {
  const nextPaths = [...currentPaths];
  const pathSet = new PathSet(currentPaths);

  for (const path of paths) {
    if (!pathSet.has(path)) {
      pathSet.add(path);
      nextPaths.push(path);
    }
  }

  return nextPaths;
};

const hasPath = (paths: string[], path: string) =>
  paths.some((currentPath) => isSamePath(currentPath, path));

const removePath = (paths: string[], path: string) =>
  paths.filter((currentPath) => !isSamePath(currentPath, path));

export const useArticleNavigatorStore = create<ArticleNavigatorStore>()((set) => ({
  ...INITIAL_ARTICLE_NAVIGATOR_STATE,

  collapseAll: () => set({ expandedDirectoryPaths: [] }),
  expandDirectories: (paths) =>
    set((state) => ({
      expandedDirectoryPaths: addUniquePaths(state.expandedDirectoryPaths, paths),
    })),
  requestRevealArticle: (articlePath, ancestorDirectoryPaths) =>
    set((state) => ({
      expandedDirectoryPaths: addUniquePaths(state.expandedDirectoryPaths, ancestorDirectoryPaths),
      revealArticlePath: articlePath,
      revealRequestId: state.revealRequestId + 1,
    })),
  reset: () => set(INITIAL_ARTICLE_NAVIGATOR_STATE),
  setDirectoryExpanded: (path, expanded) =>
    set((state) => {
      const isExpanded = hasPath(state.expandedDirectoryPaths, path);

      if (expanded === isExpanded) {
        return state;
      }

      const expandedDirectoryPaths = removePath(state.expandedDirectoryPaths, path);

      if (expanded) {
        expandedDirectoryPaths.push(path);
      }

      return { expandedDirectoryPaths };
    }),
  toggleDirectory: (path) =>
    set((state) => ({
      expandedDirectoryPaths: hasPath(state.expandedDirectoryPaths, path)
        ? removePath(state.expandedDirectoryPaths, path)
        : [...state.expandedDirectoryPaths, path],
    })),
}));
