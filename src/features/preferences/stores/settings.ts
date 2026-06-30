import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { LineEnding, MarkdownFileExtension } from "@/features/document";
import type { ArticleSortOrder } from "@/features/folder-context";
import { createPersistedTauriStore, type PersistedTauriStoreKey } from "@/lib/persistedTauriStore";
import { isWindowsPlatform } from "@/lib/platform";

export type AppearanceTheme = "light" | "dark" | "system";

export const SETTINGS_VERSION = 1;

// NOTE: src-tauri/src/folder/defaults.rs
export const DEFAULT_INDEX_FILE_NAMES = ["readme", "index"] as const;
export const DEFAULT_IGNORED_DIRECTORIES = [
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "target",
  "dist",
  "build",
  ".cache",
] as const;

export interface SettingsState {
  theme: AppearanceTheme;
  recordRecentItems: boolean;
  sidebarVisible: boolean;
  articleSortOrder: ArticleSortOrder;
  defaultNewDocumentExtension: MarkdownFileExtension;
  defaultNewDocumentLineEnding: LineEnding;
  insertFinalNewline: boolean;
  indexFileNames: string[];
  ignoredDirectories: string[];
  autoPairBracketsAndQuotes: boolean;
  softWrapCodeBlocks: boolean;
}

export interface SettingsPersistedState extends SettingsState {
  version: number;
}

export interface SettingsStore extends SettingsPersistedState {
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  reset: () => void;
}

const SETTINGS_PERSISTED_KEYS = [
  "theme",
  "recordRecentItems",
  "sidebarVisible",
  "articleSortOrder",
  "defaultNewDocumentExtension",
  "defaultNewDocumentLineEnding",
  "insertFinalNewline",
  "indexFileNames",
  "ignoredDirectories",
  "autoPairBracketsAndQuotes",
  "softWrapCodeBlocks",
] satisfies PersistedTauriStoreKey<SettingsPersistedState>[];

export const createDefaultSettingsState = (): SettingsState => ({
  theme: "system",
  recordRecentItems: true,
  sidebarVisible: true,
  articleSortOrder: "name",
  defaultNewDocumentExtension: ".md",
  defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
  insertFinalNewline: true,
  indexFileNames: [...DEFAULT_INDEX_FILE_NAMES],
  ignoredDirectories: [...DEFAULT_IGNORED_DIRECTORIES],
  autoPairBracketsAndQuotes: true,
  softWrapCodeBlocks: false,
});

export const getSystemDefaultLineEnding = (): LineEnding => (isWindowsPlatform() ? "crlf" : "lf");

export const useSettingsStore = create<SettingsStore>()(
  immer((set) => ({
    ...createDefaultSettingsState(),
    version: SETTINGS_VERSION,

    updateSetting: (key, value) =>
      set((state) => {
        (state as SettingsState)[key] = value;
      }),

    reset: () => {
      set(() => ({
        ...createDefaultSettingsState(),
        version: SETTINGS_VERSION,
      }));
    },
  })),
);

export const settingsStoreTauriHandler = createPersistedTauriStore<SettingsPersistedState>(
  "settings",
  useSettingsStore,
  {
    keys: SETTINGS_PERSISTED_KEYS,
    version: SETTINGS_VERSION,
  },
);
