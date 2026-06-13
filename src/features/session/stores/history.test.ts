import { beforeEach, describe, expect, it } from "vitest";

import { setDefaultHistory, setDefaultSettings } from "@/test/fixtures/appStores";
import { RECENT_ITEM_LIMIT, useSessionHistoryStore } from "./history";

describe("session history store", () => {
  beforeEach(() => {
    setDefaultSettings();
    setDefaultHistory();
  });

  it("records deduplicated most-recent-first bounded lists", () => {
    for (let index = 0; index <= RECENT_ITEM_LIMIT; index += 1) {
      useSessionHistoryStore.getState().recordRecentFile(`C:/Notes/${index}.md`);
      useSessionHistoryStore.getState().recordRecentFolder(`C:/Folders/${index}`);
    }

    useSessionHistoryStore.getState().recordRecentFile("C:/Notes/4.md");
    useSessionHistoryStore.getState().recordRecentFolder("C:/Folders/4");

    expect(useSessionHistoryStore.getState().recentFiles).toEqual([
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
  });

  it("respects the recent-item preference and clears history", () => {
    setDefaultSettings({ recordRecentItems: false });
    useSessionHistoryStore.getState().recordRecentFile("C:/Notes/readme.md");
    expect(useSessionHistoryStore.getState().recentFiles).toEqual([]);

    setDefaultSettings({ recordRecentItems: true });
    useSessionHistoryStore.getState().recordRecentFile("C:/Notes/readme.md");
    useSessionHistoryStore.getState().clearRecentItems();
    expect(useSessionHistoryStore.getState().recentFiles).toEqual([]);
  });

  it("does not restore legacy history after migration has completed", () => {
    setDefaultHistory({ persistenceVersion: 1, recentFiles: [] });
    useSessionHistoryStore.getState().migrateLegacyHistory(["C:/Notes/readme.md"], ["C:/Notes"]);

    expect(useSessionHistoryStore.getState().recentFiles).toEqual([]);
  });
});
