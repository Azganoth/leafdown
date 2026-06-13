import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { ArticleSortOrder } from "@/features/folder-context";

export type AppearanceTheme = "light" | "dark" | "system";
export type DefaultNewDocumentExtension = ".md" | ".markdown";
export type LineEndingPreference = "crlf" | "lf";

export const defaultIndexFileNames = ["readme", "index"];
export const defaultIgnoredDirectories = [
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "target",
  "dist",
  "build",
  ".cache",
];

export interface SettingsState {
  theme: AppearanceTheme;
  recordRecentItems: boolean;
  sidebarVisible: boolean;
  articleSortOrder: ArticleSortOrder;
  defaultNewDocumentExtension: DefaultNewDocumentExtension;
  defaultNewDocumentLineEnding: LineEndingPreference;
  insertFinalNewline: boolean;
  indexFileNames: string[];
  ignoredDirectories: string[];
  autoPairBracketsAndQuotes: boolean;
  softWrapCodeBlocks: boolean;
}

interface LegacySettingsState {
  fileTreeSortOrder: ArticleSortOrder | null;
  recentFiles: string[];
  recentFolders: string[];
  persistenceVersion: number;
}

export interface SettingsStore extends SettingsState, LegacySettingsState {
  setTheme: (theme: AppearanceTheme) => void;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  completeLegacyMigration: () => void;
  reset: () => Promise<void>;
  init: () => Promise<void>;
}

const settingsStateKeys = [
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
  "fileTreeSortOrder",
  "recentFiles",
  "recentFolders",
  "persistenceVersion",
] satisfies (keyof SettingsStore)[];

const isWindows = () => {
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")) {
    return true;
  }

  if (typeof process !== "undefined") {
    return process.platform === "win32";
  }

  return false;
};

export const getSystemDefaultLineEnding = (): LineEndingPreference => (isWindows() ? "crlf" : "lf");

export const useSettingsStore = create<SettingsStore>()(
  immer((set, get, store) => ({
    theme: "system",
    recordRecentItems: true,
    sidebarVisible: true,
    articleSortOrder: "name",
    defaultNewDocumentExtension: ".md",
    defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
    insertFinalNewline: true,
    indexFileNames: [...defaultIndexFileNames],
    ignoredDirectories: [...defaultIgnoredDirectories],
    autoPairBracketsAndQuotes: true,
    softWrapCodeBlocks: false,
    fileTreeSortOrder: null,
    recentFiles: [],
    recentFolders: [],
    persistenceVersion: 0,

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
      }),
    updateSetting: (key, value) =>
      set((state) => {
        Object.assign(state, { [key]: value });
      }),
    completeLegacyMigration: () =>
      set((state) => {
        if (state.persistenceVersion >= 1) {
          return;
        }

        if (state.fileTreeSortOrder) {
          state.articleSortOrder = state.fileTreeSortOrder;
        }

        state.fileTreeSortOrder = null;
        state.recentFiles = [];
        state.recentFolders = [];
        state.persistenceVersion = 1;
      }),

    reset: async () => {
      set(() => store.getInitialState());
    },
    init: async () => {},
  })),
);

export const settingsStoreTauriHandler = createTauriStore("settings", useSettingsStore as never, {
  filterKeys: [...settingsStateKeys],
  filterKeysStrategy: "pick",
  saveOnChange: true,
});
