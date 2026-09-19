import { createTauriStore } from "@tauri-store/zustand";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setDefaultRecentItems } from "@/test/utils/appStores";

import {
  RECENT_ITEM_LIMIT,
  RECENT_ITEMS_VERSION,
  sanitizeRecentItemsPersistedState,
  useRecentItemsStore,
  type RecentItemsState,
} from "./recentItems";

// Captured at import: the handler is created once, and mocks are cleared before each test.
const recentItemsStoreOptions = vi
  .mocked(createTauriStore)
  .mock.calls.find(([id]) => id === "recent-items")?.[2];

const loadPersistedRecentItems = (persistedState: unknown) =>
  recentItemsStoreOptions?.hooks?.beforeFrontendSync?.(persistedState as never);

const OPENED_AT = Date.UTC(2026, 8, 19, 12);
const paths = (items: { path: string }[]) => items.map(({ path }) => path);

describe("recent items store", () => {
  beforeEach(() => {
    setDefaultRecentItems();
    vi.useFakeTimers({ now: OPENED_AT });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records deduplicated most-recent-first bounded lists", () => {
    for (let index = 0; index <= RECENT_ITEM_LIMIT; index += 1) {
      useRecentItemsStore.getState().recordRecentFile(`C:/Notes/${index}.md`);
      useRecentItemsStore.getState().recordRecentFolder(`C:/Folders/${index}`);
    }

    useRecentItemsStore.getState().recordRecentFile("C:/Notes/4.md");
    useRecentItemsStore.getState().recordRecentFolder("C:/Folders/4");

    expect(paths(useRecentItemsStore.getState().recentFiles)).toEqual([
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
    expect(paths(useRecentItemsStore.getState().recentFolders)).toEqual([
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

  it("records when each recent item was opened", () => {
    useRecentItemsStore.getState().recordRecentFile("C:/Notes/readme.md");
    useRecentItemsStore.getState().recordRecentFolder("C:/Notes");

    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [{ openedAt: OPENED_AT, path: "C:/Notes/readme.md" }],
      recentFolders: [{ openedAt: OPENED_AT, path: "C:/Notes" }],
    });
  });

  it("updates the opened time of a reopened item and moves it to the front", () => {
    setDefaultRecentItems({
      recentFiles: [
        { openedAt: OPENED_AT - 1000, path: "C:/Notes/a.md" },
        { openedAt: OPENED_AT - 2000, path: "C:/Notes/b.md" },
      ],
      recentFolders: [{ path: "C:/Docs" }, { openedAt: OPENED_AT - 3000, path: "C:/Notes" }],
    });

    useRecentItemsStore.getState().recordRecentFile("C:/Notes/b.md");
    useRecentItemsStore.getState().recordRecentFolder("C:/Docs");

    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [
        { openedAt: OPENED_AT, path: "C:/Notes/b.md" },
        { openedAt: OPENED_AT - 1000, path: "C:/Notes/a.md" },
      ],
      recentFolders: [
        { openedAt: OPENED_AT, path: "C:/Docs" },
        { openedAt: OPENED_AT - 3000, path: "C:/Notes" },
      ],
    });
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

  it("removes one recent file and leaves every other entry in place", () => {
    setDefaultRecentItems({
      recentFiles: [
        { path: "C:/Notes/a.md" },
        { path: "C:/Notes/b.md" },
        { path: "C:/Notes/c.md" },
      ],
      recentFolders: [{ path: "C:/Notes" }, { path: "C:/Docs" }],
    });

    useRecentItemsStore.getState().removeRecentFile("C:/Notes/b.md");

    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [{ path: "C:/Notes/a.md" }, { path: "C:/Notes/c.md" }],
      recentFolders: [{ path: "C:/Notes" }, { path: "C:/Docs" }],
    });
  });

  it("removes one recent folder and leaves every other entry in place", () => {
    setDefaultRecentItems({
      recentFiles: [{ path: "C:/Notes/a.md" }, { path: "C:/Docs/b.md" }],
      recentFolders: [{ path: "C:/Notes" }, { path: "C:/Docs" }, { path: "C:/Drafts" }],
    });

    useRecentItemsStore.getState().removeRecentFolder("C:/Notes");

    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [{ path: "C:/Notes/a.md" }, { path: "C:/Docs/b.md" }],
      recentFolders: [{ path: "C:/Docs" }, { path: "C:/Drafts" }],
    });
  });

  it("deduplicates recent paths by path identity", () => {
    useRecentItemsStore.getState().recordRecentFile("C:/Notes/Readme.md");
    useRecentItemsStore.getState().recordRecentFile("c:\\notes\\readme.md");
    useRecentItemsStore.getState().recordRecentFolder("C:/Notes/docs");
    useRecentItemsStore.getState().recordRecentFolder("c:\\notes\\docs\\");

    expect(useRecentItemsStore.getState()).toMatchObject({
      recentFiles: [{ path: "c:\\notes\\readme.md" }],
      recentFolders: [{ path: "c:\\notes\\docs\\" }],
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

  describe("loading persisted recent items", () => {
    it("keeps the order of lists saved before opened times were recorded", () => {
      expect(
        loadPersistedRecentItems({
          recentFiles: ["C:/Notes/b.md", "C:/Notes/a.md"],
          recentFolders: ["C:/Notes", "C:/Docs"],
          version: 1,
        }),
      ).toEqual({
        recentFiles: [{ path: "C:/Notes/b.md" }, { path: "C:/Notes/a.md" }],
        recentFolders: [{ path: "C:/Notes" }, { path: "C:/Docs" }],
        version: RECENT_ITEMS_VERSION,
      });
    });

    it("keeps opened times saved with the current version", () => {
      const persistedState = {
        recentFiles: [{ openedAt: OPENED_AT, path: "C:/Notes/readme.md" }],
        recentFolders: [{ path: "C:/Notes" }],
        version: RECENT_ITEMS_VERSION,
      };

      expect(loadPersistedRecentItems(persistedState)).toEqual(persistedState);
    });
  });

  describe("sanitizeRecentItemsPersistedState", () => {
    it("keeps valid persisted recent items", () => {
      const persistedState = {
        recentFiles: [{ openedAt: OPENED_AT, path: "C:/Notes/readme.md" }],
        recentFolders: [{ path: "C:/Notes" }],
        version: RECENT_ITEMS_VERSION,
      };

      expect(sanitizeRecentItemsPersistedState(persistedState)).toEqual({
        changed: false,
        state: persistedState,
      });
    });

    it("drops an opened time that is not a number and keeps its entry", () => {
      expect(
        sanitizeRecentItemsPersistedState({
          recentFiles: [
            { openedAt: "yesterday", path: "C:/Notes/a.md" },
          ] as unknown as RecentItemsState["recentFiles"],
          version: RECENT_ITEMS_VERSION,
        }),
      ).toEqual({
        changed: true,
        state: {
          recentFiles: [{ path: "C:/Notes/a.md" }],
          version: RECENT_ITEMS_VERSION,
        },
      });
    });

    it("drops persisted lists that are not made of recent items", () => {
      const corruptState = {
        recentFiles: "C:/Notes/readme.md",
        recentFolders: [{ path: "C:/Notes" }, { openedAt: OPENED_AT }],
        version: RECENT_ITEMS_VERSION,
      } as unknown as Partial<RecentItemsState>;

      expect(sanitizeRecentItemsPersistedState(corruptState)).toEqual({
        changed: true,
        state: { version: RECENT_ITEMS_VERSION },
      });
    });

    it("bounds oversized persisted lists to the recent item limit", () => {
      const recentFiles = Array.from({ length: RECENT_ITEM_LIMIT + 5 }, (_, index) => ({
        path: `C:/Notes/${index}.md`,
      }));

      expect(
        sanitizeRecentItemsPersistedState({ recentFiles, version: RECENT_ITEMS_VERSION }),
      ).toEqual({
        changed: true,
        state: {
          recentFiles: recentFiles.slice(0, RECENT_ITEM_LIMIT),
          version: RECENT_ITEMS_VERSION,
        },
      });
    });
  });
});
