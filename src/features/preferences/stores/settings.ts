import { create } from "zustand";

import {
  LINE_ENDINGS,
  MARKDOWN_FILE_EXTENSIONS,
  type LineEnding,
  type MarkdownFileExtension,
} from "@/features/document";
import type {
  DocumentFont,
  DocumentLineSpacing,
  DocumentTextSize,
  OutlineDepth,
} from "@/features/editor";
import { ARTICLE_SORT_ORDERS, type ArticleSortOrder } from "@/features/folder-context";
import { SYSTEM_LANGUAGE } from "@/lib/i18n";
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

export const DOCUMENT_FONTS = [
  "inter",
  "ibm-plex-sans",
  "atkinson-hyperlegible",
  "literata",
  "system",
] as const satisfies readonly DocumentFont[];

export const DOCUMENT_TEXT_SIZES = [14, 16, 18, 20] as const satisfies readonly DocumentTextSize[];

export const DOCUMENT_LINE_SPACINGS = [
  "compact",
  "default",
  "relaxed",
] as const satisfies readonly DocumentLineSpacing[];

export const OUTLINE_DEPTHS = [1, 2, 3, 4, 5, 6] as const satisfies readonly OutlineDepth[];

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
  // A tag Leafdown does not ship resolves as the system language but is kept, so the choice
  // returns if that locale ships again.
  language: string;
  accentColor: AppearanceAccentColor;
  theme: AppearanceTheme;
  documentFont: DocumentFont;
  textSize: DocumentTextSize;
  lineSpacing: DocumentLineSpacing;
  recordRecentItems: boolean;
  sidebarVisible: boolean;
  statusBarVisible: boolean;
  outlineDepth: OutlineDepth;
  alwaysOnTop: boolean;
  articleSortOrder: ArticleSortOrder;
  defaultNewDocumentExtension: MarkdownFileExtension;
  defaultNewDocumentLineEnding: LineEnding;
  insertFinalNewline: boolean;
  indexFileNames: string[];
  ignoredDirectories: string[];
  whenDroppingFolder: DropBehavior;
  whenDroppingMarkdownFile: DropBehavior;
  autoPairBracketsAndQuotes: boolean;
  displayCodeBlockLineNumbers: boolean;
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
  documentFont: "inter",
  textSize: 16,
  lineSpacing: "default",
  recordRecentItems: true,
  sidebarVisible: true,
  statusBarVisible: true,
  outlineDepth: 3,
  alwaysOnTop: false,
  articleSortOrder: "name",
  defaultNewDocumentExtension: ".md",
  defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
  insertFinalNewline: true,
  indexFileNames: [...DEFAULT_INDEX_FILE_NAMES],
  ignoredDirectories: [...DEFAULT_IGNORED_DIRECTORIES],
  whenDroppingFolder: "open",
  whenDroppingMarkdownFile: "open",
  autoPairBracketsAndQuotes: true,
  displayCodeBlockLineNumbers: false,
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
  documentFont: oneOf(DOCUMENT_FONTS),
  textSize: oneOf(DOCUMENT_TEXT_SIZES),
  lineSpacing: oneOf(DOCUMENT_LINE_SPACINGS),
  recordRecentItems: booleanValue,
  sidebarVisible: booleanValue,
  statusBarVisible: booleanValue,
  outlineDepth: oneOf(OUTLINE_DEPTHS),
  alwaysOnTop: booleanValue,
  articleSortOrder: oneOf(ARTICLE_SORT_ORDERS),
  defaultNewDocumentExtension: oneOf(MARKDOWN_FILE_EXTENSION_VALUES),
  defaultNewDocumentLineEnding: oneOf(LINE_ENDINGS),
  insertFinalNewline: booleanValue,
  indexFileNames: listOf(stringValue),
  ignoredDirectories: listOf(stringValue),
  whenDroppingFolder: oneOf(DROP_BEHAVIORS),
  whenDroppingMarkdownFile: oneOf(DROP_BEHAVIORS),
  autoPairBracketsAndQuotes: booleanValue,
  displayCodeBlockLineNumbers: booleanValue,
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
