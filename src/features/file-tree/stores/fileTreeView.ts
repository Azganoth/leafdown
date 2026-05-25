import { create } from "zustand";

export interface FileTreeViewState {
  expandedDirectoryPaths: string[];
  revealFilePath: string | null;
  revealRequestId: number;
}

export interface FileTreeViewStore extends FileTreeViewState {
  collapseAll: () => void;
  expandDirectories: (paths: string[]) => void;
  requestRevealFile: (filePath: string, ancestorDirectoryPaths: string[]) => void;
  reset: () => void;
  setDirectoryExpanded: (path: string, expanded: boolean) => void;
  toggleDirectory: (path: string) => void;
}

const initialFileTreeViewState: FileTreeViewState = {
  expandedDirectoryPaths: [],
  revealFilePath: null,
  revealRequestId: 0,
};

const addUniquePaths = (currentPaths: string[], paths: string[]) => [
  ...new Set([...currentPaths, ...paths]),
];

export const useFileTreeViewStore = create<FileTreeViewStore>()((set) => ({
  ...initialFileTreeViewState,

  collapseAll: () => set({ expandedDirectoryPaths: [] }),
  expandDirectories: (paths) =>
    set((state) => ({
      expandedDirectoryPaths: addUniquePaths(state.expandedDirectoryPaths, paths),
    })),
  requestRevealFile: (filePath, ancestorDirectoryPaths) =>
    set((state) => ({
      expandedDirectoryPaths: addUniquePaths(state.expandedDirectoryPaths, ancestorDirectoryPaths),
      revealFilePath: filePath,
      revealRequestId: state.revealRequestId + 1,
    })),
  reset: () => set(initialFileTreeViewState),
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
