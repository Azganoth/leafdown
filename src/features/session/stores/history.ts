import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { useSettingsStore } from "@/features/preferences";

export const RECENT_ITEM_LIMIT = 10;

export interface SessionHistoryState {
  recentFiles: string[];
  recentFolders: string[];
  persistenceVersion: number;
}

export interface SessionHistoryStore extends SessionHistoryState {
  clearRecentItems: () => void;
  migrateLegacyHistory: (recentFiles: string[], recentFolders: string[]) => void;
  recordRecentFile: (path: string) => void;
  recordRecentFolder: (path: string) => void;
  reset: () => void;
}

const initialHistoryState: SessionHistoryState = {
  recentFiles: [],
  recentFolders: [],
  persistenceVersion: 0,
};

const addRecentPath = (items: string[], path: string) => {
  if (!path) {
    return items;
  }

  return [path, ...items.filter((item) => item !== path)].slice(0, RECENT_ITEM_LIMIT);
};

export const useSessionHistoryStore = create<SessionHistoryStore>()(
  immer((set) => ({
    ...initialHistoryState,
    clearRecentItems: () =>
      set((state) => {
        state.recentFiles = [];
        state.recentFolders = [];
      }),
    migrateLegacyHistory: (recentFiles, recentFolders) =>
      set((state) => {
        if (state.persistenceVersion >= 1) {
          return;
        }

        state.recentFiles = recentFiles.slice(0, RECENT_ITEM_LIMIT);
        state.recentFolders = recentFolders.slice(0, RECENT_ITEM_LIMIT);
        state.persistenceVersion = 1;
      }),
    recordRecentFile: (path) =>
      set((state) => {
        if (useSettingsStore.getState().recordRecentItems) {
          state.recentFiles = addRecentPath(state.recentFiles, path);
        }
      }),
    recordRecentFolder: (path) =>
      set((state) => {
        if (useSettingsStore.getState().recordRecentItems) {
          state.recentFolders = addRecentPath(state.recentFolders, path);
        }
      }),
    reset: () => set(initialHistoryState),
  })),
);

export const sessionHistoryStoreTauriHandler = createTauriStore(
  "session-history",
  useSessionHistoryStore as never,
  {
    filterKeys: ["recentFiles", "recentFolders", "persistenceVersion"],
    filterKeysStrategy: "pick",
    saveOnChange: true,
  },
);
