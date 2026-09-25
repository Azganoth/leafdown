import { create } from "zustand";

import { isSamePath, rebasePath } from "@/lib/path";
import { createPersistedTauriStore, definePersistedState } from "@/lib/persistedTauriStore";
import {
  boundedList,
  listOf,
  numberValue,
  salvagedRecord,
  stringValue,
  type ValueContract,
} from "@/lib/valueContract";

export const RECENT_ITEM_LIMIT = 10;
export const RECENT_ITEMS_VERSION = 2;

export interface RecentItem {
  // Entries recorded before version 2 have no time, and none is guessed for them.
  openedAt?: number;
  path: string;
}

export interface RecentItemsState {
  recentFiles: RecentItem[];
  recentFolders: RecentItem[];
  version: number;
}

export interface RecentItemsStore extends RecentItemsState {
  clearRecentItems: () => void;
  moveRecentPaths: (fromPath: string, toPath: string) => void;
  recordRecentFile: (path: string) => void;
  recordRecentFolder: (path: string) => void;
  removeRecentFile: (path: string) => void;
  removeRecentFolder: (path: string) => void;
  reset: () => void;
}

const createDefaultRecentItemsState = (): RecentItemsState => ({
  recentFiles: [],
  recentFolders: [],
  version: RECENT_ITEMS_VERSION,
});

const recentItemFields = salvagedRecord({ openedAt: numberValue, path: stringValue });

const recentItemValue: ValueContract<RecentItem> = {
  check: (value) => {
    const checked = recentItemFields.check(value);

    if (checked.outcome === "invalid" || checked.value.path === undefined) {
      return { outcome: "invalid" };
    }

    return checked as { outcome: "valid" | "repaired"; value: RecentItem };
  },
};

const RECENT_ITEMS_CONTRACT = definePersistedState({
  recentFiles: boundedList(listOf(recentItemValue), RECENT_ITEM_LIMIT),
  recentFolders: boundedList(listOf(recentItemValue), RECENT_ITEM_LIMIT),
  version: numberValue,
} satisfies Record<keyof RecentItemsState, unknown>);

export const sanitizeRecentItemsPersistedState = RECENT_ITEMS_CONTRACT.sanitize;

const migrateRecentItemsToOpenedTimes = (state: RecentItemsState) => {
  for (const key of ["recentFiles", "recentFolders"] as const) {
    const items: unknown = state[key];

    if (Array.isArray(items)) {
      state[key] = items.map((item: unknown) =>
        typeof item === "string" ? { path: item } : item,
      ) as RecentItem[];
    }
  }
};

const addRecentItem = (items: RecentItem[], path: string) =>
  path
    ? [
        { openedAt: Date.now(), path },
        ...items.filter((item) => !isSamePath(item.path, path)),
      ].slice(0, RECENT_ITEM_LIMIT)
    : items;

const moveRecentItems = (items: RecentItem[], fromPath: string, toPath: string) =>
  items.map((item) => {
    const path = rebasePath(item.path, fromPath, toPath);

    return path === null ? item : { ...item, path };
  });

const removeRecentItem = (items: RecentItem[], path: string) =>
  items.filter((item) => !isSamePath(item.path, path));

export const useRecentItemsStore = create<RecentItemsStore>()((set) => ({
  ...createDefaultRecentItemsState(),
  clearRecentItems: () => set({ recentFiles: [], recentFolders: [] }),
  moveRecentPaths: (fromPath, toPath) =>
    set((state) => ({
      recentFiles: moveRecentItems(state.recentFiles, fromPath, toPath),
      recentFolders: moveRecentItems(state.recentFolders, fromPath, toPath),
    })),
  recordRecentFile: (path) =>
    set((state) => ({ recentFiles: addRecentItem(state.recentFiles, path) })),
  recordRecentFolder: (path) =>
    set((state) => ({ recentFolders: addRecentItem(state.recentFolders, path) })),
  removeRecentFile: (path) =>
    set((state) => ({ recentFiles: removeRecentItem(state.recentFiles, path) })),
  removeRecentFolder: (path) =>
    set((state) => ({ recentFolders: removeRecentItem(state.recentFolders, path) })),
  reset: () => set(createDefaultRecentItemsState()),
}));

export const recentItemsStoreTauriHandler = createPersistedTauriStore<RecentItemsState>(
  "recent-items",
  useRecentItemsStore,
  {
    ...RECENT_ITEMS_CONTRACT,
    migrations: [{ version: 2, migrate: migrateRecentItemsToOpenedTimes }],
    version: RECENT_ITEMS_VERSION,
  },
);
