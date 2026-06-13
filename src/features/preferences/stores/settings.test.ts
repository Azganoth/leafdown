import { beforeEach, describe, expect, it } from "vitest";

import { setDefaultSettings } from "@/test/fixtures/appStores";
import {
  defaultIgnoredDirectories,
  defaultIndexFileNames,
  getSystemDefaultLineEnding,
  useSettingsStore,
} from "./settings";

describe("settings store", () => {
  beforeEach(() => setDefaultSettings());

  it("resets persisted settings to documented defaults", async () => {
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

    await useSettingsStore.getState().reset();

    expect(useSettingsStore.getState()).toMatchObject({
      theme: "system",
      recordRecentItems: true,
      sidebarVisible: true,
      articleSortOrder: "name",
      defaultNewDocumentExtension: ".md",
      defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
      insertFinalNewline: true,
      indexFileNames: defaultIndexFileNames,
      ignoredDirectories: defaultIgnoredDirectories,
      autoPairBracketsAndQuotes: true,
      softWrapCodeBlocks: false,
    });
  });

  it("updates persisted settings", () => {
    const settings = useSettingsStore.getState();

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

  it("migrates the legacy file-tree sort setting once", () => {
    useSettingsStore.setState({
      articleSortOrder: "name",
      fileTreeSortOrder: "modifiedDate",
      persistenceVersion: 0,
      recentFiles: ["C:/Notes/readme.md"],
      recentFolders: ["C:/Notes"],
    });

    useSettingsStore.getState().completeLegacyMigration();

    expect(useSettingsStore.getState()).toMatchObject({
      articleSortOrder: "modifiedDate",
      fileTreeSortOrder: null,
      persistenceVersion: 1,
      recentFiles: [],
      recentFolders: [],
    });
  });
});
