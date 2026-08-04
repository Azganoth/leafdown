import { create } from "zustand";

import { isSamePath } from "@/lib/path";
import { createPersistedTauriStore, definePersistedState } from "@/lib/persistedTauriStore";
import { boundedList, listOf, numberValue, stringValue } from "@/lib/valueContract";

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

const createDefaultRecentItemsState = (): RecentItemsState => ({
  recentFiles: [],
  recentFolders: [],
  version: RECENT_ITEMS_VERSION,
});

const RECENT_ITEMS_CONTRACT = definePersistedState({
  recentFiles: boundedList(listOf(stringValue), RECENT_ITEM_LIMIT),
  recentFolders: boundedList(listOf(stringValue), RECENT_ITEM_LIMIT),
  version: numberValue,
} satisfies Record<keyof RecentItemsState, unknown>);

export const sanitizeRecentItemsPersistedState = RECENT_ITEMS_CONTRACT.sanitize;

const addRecentPath = (items: string[], path: string) =>
  path
    ? [path, ...items.filter((item) => !isSamePath(item, path))].slice(0, RECENT_ITEM_LIMIT)
    : items;

export const useRecentItemsStore = create<RecentItemsStore>()((set) => ({
  ...createDefaultRecentItemsState(),
  clearRecentItems: () => set({ recentFiles: [], recentFolders: [] }),
  recordRecentFile: (path) =>
    set((state) => ({ recentFiles: addRecentPath(state.recentFiles, path) })),
  recordRecentFolder: (path) =>
    set((state) => ({ recentFolders: addRecentPath(state.recentFolders, path) })),
  reset: () => set(createDefaultRecentItemsState()),
}));

export const recentItemsStoreTauriHandler = createPersistedTauriStore<RecentItemsState>(
  "recent-items",
  useRecentItemsStore,
  {
    ...RECENT_ITEMS_CONTRACT,
    version: RECENT_ITEMS_VERSION,
  },
);
