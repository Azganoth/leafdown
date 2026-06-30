import { beforeEach, describe, expect, it } from "vitest";

import { setDefaultRecentItems } from "@/test/utils/appStores";

import { RECENT_ITEM_LIMIT, RECENT_ITEMS_VERSION, useRecentItemsStore } from "./recentItems";

describe("recent items store", () => {
  beforeEach(() => {
    setDefaultRecentItems();
  });

  it("records deduplicated most-recent-first bounded lists", () => {
    for (let index = 0; index <= RECENT_ITEM_LIMIT; index += 1) {
      useRecentItemsStore.getState().recordRecentFile(`C:/Notes/${index}.md`);
      useRecentItemsStore.getState().recordRecentFolder(`C:/Folders/${index}`);
    }

    useRecentItemsStore.getState().recordRecentFile("C:/Notes/4.md");
    useRecentItemsStore.getState().recordRecentFolder("C:/Folders/4");

    expect(useRecentItemsStore.getState().recentFiles).toEqual([
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
    expect(useRecentItemsStore.getState().recentFolders).toEqual([
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

  it("clears recent items", () => {
    useRecentItemsStore.getState().recordRecentFile("C:/Notes/readme.md");
    useRecentItemsStore.getState().recordRecentFolder("C:/Notes");

    useRecentItemsStore.getState().clearRecentItems();

    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [],
      recentFolders: [],
    });
  });

  it("deduplicates recent paths by path identity", () => {
    useRecentItemsStore.getState().recordRecentFile("C:/Notes/Readme.md");
    useRecentItemsStore.getState().recordRecentFile("c:\\notes\\readme.md");
    useRecentItemsStore.getState().recordRecentFolder("C:/Notes/docs");
    useRecentItemsStore.getState().recordRecentFolder("c:\\notes\\docs\\");

    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: ["c:\\notes\\readme.md"],
      recentFolders: ["c:\\notes\\docs\\"],
    });
  });

  it("resets recent items to the current persistence version", () => {
    setDefaultRecentItems({ version: 0 });

    useRecentItemsStore.getState().reset();

    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [],
      recentFolders: [],
      version: RECENT_ITEMS_VERSION,
    });
  });
});
