import { beforeEach, describe, expect, it } from "vitest";

import { setDefaultSettings } from "@/test/fixtures/appStores";
import {
  RECENT_ITEM_LIMIT,
  defaultIgnoredDirectories,
  defaultIndexFileNames,
  getSystemDefaultLineEnding,
  useSettingsStore,
} from "./settings";

describe("settings store", () => {
  beforeEach(() => {
    setDefaultSettings();
  });

  it("resets persisted MVP settings to documented defaults", async () => {
    setDefaultSettings({
      theme: "dark",
      recordRecentItems: false,
      recentFiles: ["C:/Notes/one.md"],
      recentFolders: ["C:/Notes"],
      sidebarVisible: false,
      fileTreeSortOrder: "modifiedDate",
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
      recentFiles: [],
      recentFolders: [],
      sidebarVisible: true,
      fileTreeSortOrder: "name",
      defaultNewDocumentExtension: ".md",
      defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
      insertFinalNewline: true,
      indexFileNames: defaultIndexFileNames,
      ignoredDirectories: defaultIgnoredDirectories,
      autoPairBracketsAndQuotes: true,
      softWrapCodeBlocks: false,
    });
  });

  it("updates persisted MVP settings", () => {
    useSettingsStore.getState().updateSetting("recordRecentItems", false);
    useSettingsStore.getState().updateSetting("sidebarVisible", false);
    useSettingsStore.getState().updateSetting("fileTreeSortOrder", "type");
    useSettingsStore.getState().updateSetting("defaultNewDocumentExtension", ".markdown");
    useSettingsStore.getState().updateSetting("defaultNewDocumentLineEnding", "lf");
    useSettingsStore.getState().updateSetting("insertFinalNewline", false);
    useSettingsStore.getState().updateSetting("indexFileNames", ["home", "index"]);
    useSettingsStore.getState().updateSetting("ignoredDirectories", [".git", "vendor"]);
    useSettingsStore.getState().updateSetting("autoPairBracketsAndQuotes", false);
    useSettingsStore.getState().updateSetting("softWrapCodeBlocks", true);

    expect(useSettingsStore.getState()).toMatchObject({
      recordRecentItems: false,
      sidebarVisible: false,
      fileTreeSortOrder: "type",
      defaultNewDocumentExtension: ".markdown",
      defaultNewDocumentLineEnding: "lf",
      insertFinalNewline: false,
      indexFileNames: ["home", "index"],
      ignoredDirectories: [".git", "vendor"],
      autoPairBracketsAndQuotes: false,
      softWrapCodeBlocks: true,
    });
  });

  it("records recent files and folders as deduplicated most-recent-first bounded lists", () => {
    for (let index = 0; index <= RECENT_ITEM_LIMIT; index += 1) {
      useSettingsStore.getState().recordRecentFile(`C:/Notes/${index}.md`);
      useSettingsStore.getState().recordRecentFolder(`C:/Folders/${index}`);
    }

    useSettingsStore.getState().recordRecentFile("C:/Notes/4.md");
    useSettingsStore.getState().recordRecentFolder("C:/Folders/4");

    expect(useSettingsStore.getState().recentFiles).toEqual([
      "C:/Notes/4.md",
      "C:/Notes/10.md",
      "C:/Notes/9.md",
      "C:/Notes/8.md",
      "C:/Notes/7.md",
      "C:/Notes/6.md",
      "C:/Notes/5.md",
      "C:/Notes/3.md",
      "C:/Notes/2.md",
      "C:/Notes/1.md",
    ]);
    expect(useSettingsStore.getState().recentFolders).toEqual([
      "C:/Folders/4",
      "C:/Folders/10",
      "C:/Folders/9",
      "C:/Folders/8",
      "C:/Folders/7",
      "C:/Folders/6",
      "C:/Folders/5",
      "C:/Folders/3",
      "C:/Folders/2",
      "C:/Folders/1",
    ]);
  });

  it("does not record recent items when recording is disabled", () => {
    useSettingsStore.getState().updateSetting("recordRecentItems", false);

    useSettingsStore.getState().recordRecentFile("C:/Notes/readme.md");
    useSettingsStore.getState().recordRecentFolder("C:/Notes");

    expect(useSettingsStore.getState().recentFiles).toEqual([]);
    expect(useSettingsStore.getState().recentFolders).toEqual([]);
  });

  it("clears recent files and folders together", () => {
    useSettingsStore.getState().recordRecentFile("C:/Notes/readme.md");
    useSettingsStore.getState().recordRecentFolder("C:/Notes");

    useSettingsStore.getState().clearRecentItems();

    expect(useSettingsStore.getState().recentFiles).toEqual([]);
    expect(useSettingsStore.getState().recentFolders).toEqual([]);
  });
});
