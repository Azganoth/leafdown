import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { isSamePath } from "@/lib/path";
import { createPersistedTauriStore, type PersistedTauriStoreKey } from "@/lib/persistedTauriStore";

export const RECENT_ITEM_LIMIT = 10;
export const RECENT_ITEMS_VERSION = 1;

export interface RecentItemsState {
  recentFiles: string[];
  recentFolders: string[];
  version: number;
}

export interface RecentItemsStore extends RecentItemsState {
  clearRecentItems: () => void;
  recordRecentFile: (path: string) => void;
  recordRecentFolder: (path: string) => void;
  reset: () => void;
}

const RECENT_ITEMS_PERSISTED_KEYS = [
  "recentFiles",
  "recentFolders",
] satisfies PersistedTauriStoreKey<RecentItemsState>[];

const createDefaultRecentItemsState = (): RecentItemsState => ({
  recentFiles: [],
  recentFolders: [],
  version: RECENT_ITEMS_VERSION,
});

const addRecentPath = (items: string[], path: string) =>
  path
    ? [path, ...items.filter((item) => !isSamePath(item, path))].slice(0, RECENT_ITEM_LIMIT)
    : items;

export const useRecentItemsStore = create<RecentItemsStore>()(
  immer((set) => ({
    ...createDefaultRecentItemsState(),
    clearRecentItems: () =>
      set((state) => {
        state.recentFiles = [];
        state.recentFolders = [];
      }),
    recordRecentFile: (path) =>
      set((state) => {
        state.recentFiles = addRecentPath(state.recentFiles, path);
      }),
    recordRecentFolder: (path) =>
      set((state) => {
        state.recentFolders = addRecentPath(state.recentFolders, path);
      }),
    reset: () => set(createDefaultRecentItemsState()),
  })),
);

export const recentItemsStoreTauriHandler = createPersistedTauriStore<RecentItemsState>(
  "recent-items",
  useRecentItemsStore,
  {
    keys: RECENT_ITEMS_PERSISTED_KEYS,
    version: RECENT_ITEMS_VERSION,
  },
);
