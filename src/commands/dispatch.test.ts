import { beforeEach, describe, expect, it } from "vitest";

import { useArticleNavigatorStore } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { useSessionHistoryStore, useSessionStore } from "@/features/session";
import {
  resetAppStores,
  setDefaultHistory,
  setDefaultSession,
  setDefaultSettings,
} from "@/test/fixtures/appStores";
import { dispatchAppCommand, type AppCommandDispatchContext } from "./dispatch";

const createContext = (
  overrides: Partial<AppCommandDispatchContext> = {},
): AppCommandDispatchContext => ({
  activeArticleAncestorPaths: null,
  activeDocumentKey: null,
  activeFilePath: null,
  folderContext: null,
  fullscreen: false,
  pendingSortOrder: null,
  setAboutOpen: () => {},
  setFullscreen: () => {},
  setPendingSortOrder: () => {},
  setPreferencesOpen: () => {},
  setZoom: () => {},
  zoom: 1,
  ...overrides,
});

describe("app command dispatch", () => {
  beforeEach(() => resetAppStores());

  it("routes history and preference commands to their owning stores", () => {
    setDefaultHistory({ recentFiles: ["C:/Notes/readme.md"] });
    setDefaultSettings({ sidebarVisible: true });

    dispatchAppCommand("file.clearRecentItems", createContext());
    dispatchAppCommand("view.toggleSidebar", createContext());

    expect(useSessionHistoryStore.getState().recentFiles).toEqual([]);
    expect(useSettingsStore.getState().sidebarVisible).toBe(false);
  });

  it("routes document state and navigator commands to their feature APIs", () => {
    setDefaultSession({
      activeDocument: {
        status: "saved",
        path: "C:/Notes/readme.md",
        content: "# Notes",
        lineEnding: "lf",
        metadata: { sizeBytes: 7, modifiedAtUnixMs: 1 },
      },
    });
    useArticleNavigatorStore.setState({ expandedDirectoryPaths: ["C:/Notes/docs"] });

    dispatchAppCommand(
      "edit.lineEnding.crlf",
      createContext({ activeDocumentKey: "C:/Notes/readme.md" }),
    );
    dispatchAppCommand("view.collapseAllFolders", createContext());

    expect(useSessionStore.getState().activeDocument?.lineEnding).toBe("crlf");
    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([]);
  });
});
