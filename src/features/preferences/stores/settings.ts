import { create } from "zustand";

import {
  LINE_ENDINGS,
  MARKDOWN_FILE_EXTENSIONS,
  type LineEnding,
  type MarkdownFileExtension,
} from "@/features/document";
import { ARTICLE_SORT_ORDERS, type ArticleSortOrder } from "@/features/folder-context";
import { SYSTEM_LANGUAGE } from "@/lib/i18n/localizer";
import { createPersistedTauriStore, definePersistedState } from "@/lib/persistedTauriStore";
import { isWindowsPlatform } from "@/lib/platform";
import { booleanValue, listOf, numberValue, oneOf, stringValue } from "@/lib/valueContract";

export const APPEARANCE_THEMES = ["light", "dark", "system"] as const;
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];

export const APPEARANCE_ACCENT_COLORS = [
  "neutral",
  "red",
  "orange",
  "amber",
  "emerald",
  "cyan",
  "blue",
  "violet",
  "fuchsia",
] as const;
export type AppearanceAccentColor = (typeof APPEARANCE_ACCENT_COLORS)[number];

export const DROP_BEHAVIORS = ["open", "insertLink"] as const;
export type DropBehavior = (typeof DROP_BEHAVIORS)[number];

export const SETTINGS_VERSION = 2;

// Rust commands can omit these arguments, so their fallback defaults must match these settings.
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
  // "system" or a BCP 47 tag; a tag Leafdown does not ship resolves as "system" without being
  // overwritten, so the choice returns if that locale ships again.
  language: string;
  accentColor: AppearanceAccentColor;
  theme: AppearanceTheme;
  recordRecentItems: boolean;
  sidebarVisible: boolean;
  statusBarVisible: boolean;
  articleSortOrder: ArticleSortOrder;
  defaultNewDocumentExtension: MarkdownFileExtension;
  defaultNewDocumentLineEnding: LineEnding;
  insertFinalNewline: boolean;
  indexFileNames: string[];
  ignoredDirectories: string[];
  whenDroppingFolder: DropBehavior;
  whenDroppingMarkdownFile: DropBehavior;
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
  language: SYSTEM_LANGUAGE,
  accentColor: "neutral",
  theme: "system",
  recordRecentItems: true,
  sidebarVisible: true,
  statusBarVisible: true,
  articleSortOrder: "name",
  defaultNewDocumentExtension: ".md",
  defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
  insertFinalNewline: true,
  indexFileNames: [...DEFAULT_INDEX_FILE_NAMES],
  ignoredDirectories: [...DEFAULT_IGNORED_DIRECTORIES],
  whenDroppingFolder: "open",
  whenDroppingMarkdownFile: "open",
  autoPairBracketsAndQuotes: true,
  softWrapCodeBlocks: false,
});

export const getSystemDefaultLineEnding = (): LineEnding => (isWindowsPlatform() ? "crlf" : "lf");

const MARKDOWN_FILE_EXTENSION_VALUES = MARKDOWN_FILE_EXTENSIONS.map(
  // The template literal widens to `string`; the assertion is what keeps the union.
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
  (extension) => `.${extension}` as MarkdownFileExtension,
);

const SETTINGS_CONTRACT = definePersistedState({
  language: stringValue,
  accentColor: oneOf(APPEARANCE_ACCENT_COLORS),
  theme: oneOf(APPEARANCE_THEMES),
  recordRecentItems: booleanValue,
  sidebarVisible: booleanValue,
  statusBarVisible: booleanValue,
  articleSortOrder: oneOf(ARTICLE_SORT_ORDERS),
  defaultNewDocumentExtension: oneOf(MARKDOWN_FILE_EXTENSION_VALUES),
  defaultNewDocumentLineEnding: oneOf(LINE_ENDINGS),
  insertFinalNewline: booleanValue,
  indexFileNames: listOf(stringValue),
  ignoredDirectories: listOf(stringValue),
  whenDroppingFolder: oneOf(DROP_BEHAVIORS),
  whenDroppingMarkdownFile: oneOf(DROP_BEHAVIORS),
  autoPairBracketsAndQuotes: booleanValue,
  softWrapCodeBlocks: booleanValue,
  version: numberValue,
} satisfies Record<keyof SettingsPersistedState, unknown>);

export const sanitizeSettingsPersistedState = SETTINGS_CONTRACT.sanitize;

export const useSettingsStore = create<SettingsStore>()((set) => ({
  ...createDefaultSettingsState(),
  version: SETTINGS_VERSION,

  updateSetting: (key, value) =>
    set((state) => ({
      ...state,
      [key]: value,
    })),

  reset: () =>
    set({
      ...createDefaultSettingsState(),
      version: SETTINGS_VERSION,
    }),
}));

export const settingsStoreTauriHandler = createPersistedTauriStore<SettingsPersistedState>(
  "settings",
  useSettingsStore,
  {
    ...SETTINGS_CONTRACT,
    version: SETTINGS_VERSION,
  },
);
