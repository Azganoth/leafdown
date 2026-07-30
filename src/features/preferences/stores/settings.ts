import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  LINE_ENDINGS,
  MARKDOWN_FILE_EXTENSIONS,
  type LineEnding,
  type MarkdownFileExtension,
} from "@/features/document";
import { ARTICLE_SORT_ORDERS, type ArticleSortOrder } from "@/features/folder-context";
import { createPersistedTauriStore, type PersistedTauriStoreKey } from "@/lib/persistedTauriStore";
import { isWindowsPlatform } from "@/lib/platform";
import { isBoolean, isOneOf, isStringArray } from "@/lib/predicates";

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

const MARKDOWN_FILE_EXTENSION_VALUES = MARKDOWN_FILE_EXTENSIONS.map(
  (extension) => `.${extension}` as MarkdownFileExtension,
);

const SETTINGS_VALUE_VALIDATORS: Record<keyof SettingsState, (value: unknown) => boolean> = {
  theme: (value) => isOneOf(APPEARANCE_THEMES, value),
  recordRecentItems: isBoolean,
  sidebarVisible: isBoolean,
  articleSortOrder: (value) => isOneOf(ARTICLE_SORT_ORDERS, value),
  defaultNewDocumentExtension: (value) => isOneOf(MARKDOWN_FILE_EXTENSION_VALUES, value),
  defaultNewDocumentLineEnding: (value) => isOneOf(LINE_ENDINGS, value),
  insertFinalNewline: isBoolean,
  indexFileNames: isStringArray,
  ignoredDirectories: isStringArray,
  autoPairBracketsAndQuotes: isBoolean,
  softWrapCodeBlocks: isBoolean,
};

export const sanitizeSettingsPersistedState = (state: Partial<SettingsPersistedState>) => {
  const sanitizedState: Partial<SettingsPersistedState> = {};
  let changed = false;

  for (const [key, value] of Object.entries(state)) {
    if (key === "version") {
      if (typeof value === "number") {
        sanitizedState.version = value;
      } else {
        changed = true;
      }

      continue;
    }

    if (SETTINGS_VALUE_VALIDATORS[key as keyof SettingsState]?.(value)) {
      Object.assign(sanitizedState, { [key]: value });
    } else {
      changed = true;
    }
  }

  return {
    changed,
    state: changed ? sanitizedState : state,
  };
};

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
    sanitize: sanitizeSettingsPersistedState,
    version: SETTINGS_VERSION,
  },
);
