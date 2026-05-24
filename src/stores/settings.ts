import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type AppearanceTheme = "light" | "dark" | "system";
export type DefaultNewDocumentExtension = ".md" | ".markdown";
export type FileTreeSortOrder = "name" | "modifiedDate" | "type";
export type LineEndingPreference = "crlf" | "lf";

export const RECENT_ITEM_LIMIT = 10;

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
  recentFiles: string[];
  recentFolders: string[];
  sidebarVisible: boolean;
  fileTreeSortOrder: FileTreeSortOrder;
  defaultNewDocumentExtension: DefaultNewDocumentExtension;
  defaultNewDocumentLineEnding: LineEndingPreference;
  insertFinalNewline: boolean;
  indexFileNames: string[];
  ignoredDirectories: string[];
  autoPairBracketsAndQuotes: boolean;
  softWrapCodeBlocks: boolean;
}

export interface SettingsStore extends SettingsState {
  setTheme: (theme: AppearanceTheme) => void;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  recordRecentFile: (path: string) => void;
  recordRecentFolder: (path: string) => void;
  clearRecentItems: () => void;

  reset: () => Promise<void>;
  init: () => Promise<void>;
}

const settingsStateKeys = [
  "theme",
  "recordRecentItems",
  "recentFiles",
  "recentFolders",
  "sidebarVisible",
  "fileTreeSortOrder",
  "defaultNewDocumentExtension",
  "defaultNewDocumentLineEnding",
  "insertFinalNewline",
  "indexFileNames",
  "ignoredDirectories",
  "autoPairBracketsAndQuotes",
  "softWrapCodeBlocks",
] satisfies (keyof SettingsState)[];

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

const addRecentPath = (items: string[], path: string) => {
  if (!path) {
    return items;
  }

  return [path, ...items.filter((item) => item !== path)].slice(0, RECENT_ITEM_LIMIT);
};

export const useSettingsStore = create<SettingsStore>()(
  immer((set, get, store) => ({
    theme: "system",
    recordRecentItems: true,
    recentFiles: [],
    recentFolders: [],
    sidebarVisible: true,
    fileTreeSortOrder: "name",
    defaultNewDocumentExtension: ".md",
    defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
    insertFinalNewline: true,
    indexFileNames: [...defaultIndexFileNames],
    ignoredDirectories: [...defaultIgnoredDirectories],
    autoPairBracketsAndQuotes: true,
    softWrapCodeBlocks: false,

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
      }),
    updateSetting: (key, value) =>
      set((state) => {
        Object.assign(state, { [key]: value });
      }),
    recordRecentFile: (path) =>
      set((state) => {
        if (!state.recordRecentItems) {
          return;
        }

        state.recentFiles = addRecentPath(state.recentFiles, path);
      }),
    recordRecentFolder: (path) =>
      set((state) => {
        if (!state.recordRecentItems) {
          return;
        }

        state.recentFolders = addRecentPath(state.recentFolders, path);
      }),
    clearRecentItems: () =>
      set((state) => {
        state.recentFiles = [];
        state.recentFolders = [];
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
