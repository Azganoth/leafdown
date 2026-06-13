import { create } from "zustand";

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

const initialArticleNavigatorState: ArticleNavigatorState = {
  expandedDirectoryPaths: [],
  revealArticlePath: null,
  revealRequestId: 0,
};

const addUniquePaths = (currentPaths: string[], paths: string[]) => [
  ...new Set([...currentPaths, ...paths]),
];

export const useArticleNavigatorStore = create<ArticleNavigatorStore>()((set) => ({
  ...initialArticleNavigatorState,

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
  reset: () => set(initialArticleNavigatorState),
  setDirectoryExpanded: (path, expanded) =>
    set((state) => {
      const nextExpandedDirectoryPaths = state.expandedDirectoryPaths.filter(
        (expandedPath) => expandedPath !== path,
      );

      if (expanded) {
        nextExpandedDirectoryPaths.push(path);
      }

      return {
        expandedDirectoryPaths: nextExpandedDirectoryPaths,
      };
    }),
  toggleDirectory: (path) =>
    set((state) => ({
      expandedDirectoryPaths: state.expandedDirectoryPaths.includes(path)
        ? state.expandedDirectoryPaths.filter((expandedPath) => expandedPath !== path)
        : [...state.expandedDirectoryPaths, path],
    })),
}));
