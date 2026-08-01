import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  LINE_ENDINGS,
  MARKDOWN_FILE_EXTENSIONS,
  type LineEnding,
  type MarkdownFileExtension,
} from "@/features/document";
import { ARTICLE_SORT_ORDERS, type ArticleSortOrder } from "@/features/folder-context";
import { createPersistedTauriStore, definePersistedState } from "@/lib/persistedTauriStore";
import { isWindowsPlatform } from "@/lib/platform";
import { booleanValue, listOf, numberValue, oneOf, stringValue } from "@/lib/valueContract";

export const APPEARANCE_THEMES = ["light", "dark", "system"] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

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

const MARKDOWN_FILE_EXTENSION_VALUES = MARKDOWN_FILE_EXTENSIONS.map(
  (extension) => `.${extension}` as MarkdownFileExtension,
);

const SETTINGS_CONTRACT = definePersistedState({
  theme: oneOf(APPEARANCE_THEMES),
  recordRecentItems: booleanValue,
  sidebarVisible: booleanValue,
  articleSortOrder: oneOf(ARTICLE_SORT_ORDERS),
  defaultNewDocumentExtension: oneOf(MARKDOWN_FILE_EXTENSION_VALUES),
  defaultNewDocumentLineEnding: oneOf(LINE_ENDINGS),
  insertFinalNewline: booleanValue,
  indexFileNames: listOf(stringValue),
  ignoredDirectories: listOf(stringValue),
  autoPairBracketsAndQuotes: booleanValue,
  softWrapCodeBlocks: booleanValue,
  version: numberValue,
} satisfies Record<keyof SettingsPersistedState, unknown>);

export const sanitizeSettingsPersistedState = SETTINGS_CONTRACT.sanitize;

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
    ...SETTINGS_CONTRACT,
    version: SETTINGS_VERSION,
  },
);
