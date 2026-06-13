import { beforeEach, describe, expect, it } from "vitest";

import { useSettingsStore } from "@/features/preferences";
import { setDefaultHistory, setDefaultSettings } from "@/test/fixtures/appStores";
import { useSessionHistoryStore } from "../stores/history";
import { migrateLegacyPersistedState } from "./persistenceMigration";

describe("persisted state migration", () => {
  beforeEach(() => {
    setDefaultSettings();
    setDefaultHistory({ persistenceVersion: 0 });
  });

  it("moves legacy recents and sort order to their new owners", async () => {
    useSettingsStore.setState({
      fileTreeSortOrder: "type",
      persistenceVersion: 0,
      recentFiles: ["C:/Notes/readme.md"],
      recentFolders: ["C:/Notes"],
    });

    await migrateLegacyPersistedState();

    expect(useSessionHistoryStore.getState()).toMatchObject({
      persistenceVersion: 1,
      recentFiles: ["C:/Notes/readme.md"],
      recentFolders: ["C:/Notes"],
    });
    expect(useSettingsStore.getState()).toMatchObject({
      articleSortOrder: "type",
      persistenceVersion: 1,
      recentFiles: [],
      recentFolders: [],
    });
  });

  it("does not restore cleared history after the history migration version is recorded", async () => {
    setDefaultHistory({ persistenceVersion: 1, recentFiles: [], recentFolders: [] });
    useSettingsStore.setState({
      persistenceVersion: 0,
      recentFiles: ["C:/Notes/readme.md"],
      recentFolders: ["C:/Notes"],
    });

    await migrateLegacyPersistedState();

    expect(useSessionHistoryStore.getState()).toMatchObject({
      recentFiles: [],
      recentFolders: [],
    });
  });
});
