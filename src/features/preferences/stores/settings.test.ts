import { beforeEach, describe, expect, it } from "vitest";

import { setDefaultSettings } from "@/test/utils/appStores";

import {
  DEFAULT_IGNORED_DIRECTORIES,
  DEFAULT_INDEX_FILE_NAMES,
  getSystemDefaultLineEnding,
  sanitizeSettingsPersistedState,
  SETTINGS_VERSION,
  useSettingsStore,
  type SettingsPersistedState,
} from "./settings";

describe("settings store", () => {
  beforeEach(() => setDefaultSettings());

  it("resets persisted settings to documented defaults", () => {
    setDefaultSettings({
      theme: "dark",
      recordRecentItems: false,
      sidebarVisible: false,
      articleSortOrder: "modifiedDate",
      defaultNewDocumentExtension: ".markdown",
      defaultNewDocumentLineEnding: "lf",
      insertFinalNewline: false,
      indexFileNames: ["home"],
      ignoredDirectories: ["vendor"],
      autoPairBracketsAndQuotes: false,
      softWrapCodeBlocks: true,
    });

    useSettingsStore.getState().reset();

    expect(useSettingsStore.getState()).toMatchObject({
      theme: "system",
      recordRecentItems: true,
      sidebarVisible: true,
      articleSortOrder: "name",
      defaultNewDocumentExtension: ".md",
      defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
      insertFinalNewline: true,
      indexFileNames: DEFAULT_INDEX_FILE_NAMES,
      ignoredDirectories: DEFAULT_IGNORED_DIRECTORIES,
      autoPairBracketsAndQuotes: true,
      softWrapCodeBlocks: false,
      version: SETTINGS_VERSION,
    });
  });

  it("updates persisted settings", () => {
    const settings = useSettingsStore.getState();

    settings.updateSetting("theme", "dark");
    settings.updateSetting("recordRecentItems", false);
    settings.updateSetting("sidebarVisible", false);
    settings.updateSetting("articleSortOrder", "type");
    settings.updateSetting("defaultNewDocumentExtension", ".markdown");
    settings.updateSetting("defaultNewDocumentLineEnding", "lf");
    settings.updateSetting("insertFinalNewline", false);
    settings.updateSetting("indexFileNames", ["home", "index"]);
    settings.updateSetting("ignoredDirectories", [".git", "vendor"]);
    settings.updateSetting("autoPairBracketsAndQuotes", false);
    settings.updateSetting("softWrapCodeBlocks", true);

    expect(useSettingsStore.getState()).toMatchObject({
      theme: "dark",
      recordRecentItems: false,
      sidebarVisible: false,
      articleSortOrder: "type",
      defaultNewDocumentExtension: ".markdown",
      defaultNewDocumentLineEnding: "lf",
      insertFinalNewline: false,
      indexFileNames: ["home", "index"],
      ignoredDirectories: [".git", "vendor"],
      autoPairBracketsAndQuotes: false,
      softWrapCodeBlocks: true,
    });
  });

  it("resets settings to the current persistence version", () => {
    useSettingsStore.setState({ version: 0 });

    useSettingsStore.getState().reset();

    expect(useSettingsStore.getState().version).toBe(SETTINGS_VERSION);
  });

  describe("sanitizeSettingsPersistedState", () => {
    it("keeps every valid persisted setting", () => {
      const persistedState: SettingsPersistedState = {
        theme: "dark",
        recordRecentItems: false,
        sidebarVisible: false,
        articleSortOrder: "modifiedDate",
        defaultNewDocumentExtension: ".markdown",
        defaultNewDocumentLineEnding: "lf",
        insertFinalNewline: false,
        indexFileNames: ["home"],
        ignoredDirectories: ["vendor"],
        autoPairBracketsAndQuotes: false,
        softWrapCodeBlocks: true,
        version: SETTINGS_VERSION,
      };

      expect(sanitizeSettingsPersistedState(persistedState)).toEqual({
        changed: false,
        state: persistedState,
      });
    });

    it("drops persisted settings that fail their value contract", () => {
      const corruptState = {
        theme: "midnight",
        sidebarVisible: "yes",
        articleSortOrder: 3,
        defaultNewDocumentExtension: "md",
        defaultNewDocumentLineEnding: "cr",
        indexFileNames: "home",
        ignoredDirectories: ["vendor", 7],
        version: SETTINGS_VERSION,
      } as unknown as Partial<SettingsPersistedState>;

      expect(sanitizeSettingsPersistedState(corruptState)).toEqual({
        changed: true,
        state: { version: SETTINGS_VERSION },
      });
    });

    it("drops unknown keys and non-numeric versions", () => {
      const corruptState = {
        theme: "light",
        injected: "value",
        version: "1",
      } as unknown as Partial<SettingsPersistedState>;

      expect(sanitizeSettingsPersistedState(corruptState)).toEqual({
        changed: true,
        state: { theme: "light" },
      });
    });
  });
});
