import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { describe, expect, it, vi } from "vitest";

import { useArticleNavigatorStore } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { useSessionStore } from "@/features/session";
import { toastManager } from "@/lib/toast";
import { createAppCommandContext } from "@/test/factories/commands";
import { createSavedDocument } from "@/test/factories/document";
import { createFolderContextWithNestedReadme } from "@/test/factories/folderContext";
import { TEST_NESTED_DIRECTORY_PATH } from "@/test/fixtures/paths";
import { setDefaultSession, setDefaultSettings, setDefaultUI } from "@/test/utils/appStores";

import { useCommandUIStore } from "../stores/commandUi";
import {
  collapseAllFolders,
  expandAllFolders,
  getKeepTabState,
  getShowAllFilesState,
  getShowTabAtState,
  getSwitchTabState,
  keepTab,
  resetZoom,
  setDarkTheme,
  setLightTheme,
  setSystemTheme,
  showNextTab,
  showPreviousTab,
  showTabAt,
  sortByType,
  toggleAlwaysOnTop,
  toggleShowAllFiles,
  toggleFullscreen,
  toggleSidebar,
  toggleStatusBar,
  zoomIn,
  zoomOut,
} from "./view";

describe("view actions", () => {
  it("toggles the sidebar visibility", () => {
    setDefaultSettings({ sidebarVisible: true });
    toggleSidebar();
    expect(useSettingsStore.getState().sidebarVisible).toBe(false);
  });

  it("toggles the status bar visibility", () => {
    setDefaultSettings({ statusBarVisible: true });
    toggleStatusBar();
    expect(useSettingsStore.getState().statusBarVisible).toBe(false);
    toggleStatusBar();
    expect(useSettingsStore.getState().statusBarVisible).toBe(true);
  });

  it("toggles whether the article navigator shows all files", () => {
    setDefaultSettings({ showAllFiles: false });
    toggleShowAllFiles();
    expect(useSettingsStore.getState().showAllFiles).toBe(true);
    toggleShowAllFiles();
    expect(useSettingsStore.getState().showAllFiles).toBe(false);
  });

  it("checks Show all files while a folder context is open", () => {
    const folderContext = createFolderContextWithNestedReadme();

    expect(
      getShowAllFilesState(createAppCommandContext({ settings: { showAllFiles: true } })),
    ).toMatchObject({ enabled: false });
    expect(
      getShowAllFilesState(
        createAppCommandContext({ folderContext, settings: { showAllFiles: true } }),
      ),
    ).toMatchObject({ enabled: true, checked: true });
    expect(
      getShowAllFilesState(
        createAppCommandContext({ folderContext, settings: { showAllFiles: false } }),
      ),
    ).toMatchObject({ enabled: true, checked: false });
  });

  it("collapses all article navigator directories", () => {
    useArticleNavigatorStore.getState().expandDirectories(["C:/Notes/docs"]);
    collapseAllFolders();
    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([]);
  });

  it("expands all article navigator directories for the current folder context", () => {
    expandAllFolders(
      createAppCommandContext({
        folderContext: createFolderContextWithNestedReadme(),
      }),
    );

    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([
      TEST_NESTED_DIRECTORY_PATH,
    ]);
  });

  it("clamps zoom commands and updates local zoom after the webview accepts the change", async () => {
    setDefaultUI({ zoom: 1.95 });

    zoomIn();

    await vi.waitFor(() => {
      expect(getCurrentWebview().setZoom).toHaveBeenCalledWith(2);
      expect(useCommandUIStore.getState().zoom).toBe(2);
    });
  });

  it("shows a command error when zoom updates fail", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(getCurrentWebview().setZoom).mockRejectedValueOnce(new Error("webview unavailable"));
    setDefaultUI({ zoom: 1.0 });

    zoomOut();

    await vi.waitFor(() => {
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "webview unavailable",
        title: "Could not update zoom.",
        type: "error",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Unexpected error (updateZoom).",
        expect.any(Error),
      );
    });
    expect(useCommandUIStore.getState().zoom).toBe(1.0);
  });

  it("zooms out and resets zoom after the webview accepts the change", async () => {
    setDefaultUI({ zoom: 0.55 });

    zoomOut();

    await vi.waitFor(() => {
      expect(getCurrentWebview().setZoom).toHaveBeenCalledWith(0.5);
      expect(useCommandUIStore.getState().zoom).toBe(0.5);
    });

    setDefaultUI({ zoom: 1.4 });

    resetZoom();

    await vi.waitFor(() => {
      expect(getCurrentWebview().setZoom).toHaveBeenCalledWith(1);
      expect(useCommandUIStore.getState().zoom).toBe(1);
    });
  });

  it("toggles fullscreen using the next value consistently", async () => {
    setDefaultUI({ fullscreen: false });

    void toggleFullscreen();

    await vi.waitFor(() => {
      expect(getCurrentWindow().setFullscreen).toHaveBeenCalledWith(true);
      expect(useCommandUIStore.getState().fullscreen).toBe(true);
    });
  });

  it("shows a command error when fullscreen updates fail", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(getCurrentWindow().setFullscreen).mockRejectedValueOnce(
      new Error("window unavailable"),
    );
    setDefaultUI({ fullscreen: true });

    void toggleFullscreen();

    await vi.waitFor(() => {
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "window unavailable",
        title: "Could not update fullscreen mode.",
        type: "error",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Unexpected error (toggleFullscreen).",
        expect.any(Error),
      );
    });
    expect(useCommandUIStore.getState().fullscreen).toBe(true);
  });

  it("toggles always on top once the window accepts each change", async () => {
    setDefaultSettings({ alwaysOnTop: false });

    await toggleAlwaysOnTop();

    expect(getCurrentWindow().setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(useSettingsStore.getState().alwaysOnTop).toBe(true);

    await toggleAlwaysOnTop();

    expect(getCurrentWindow().setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(useSettingsStore.getState().alwaysOnTop).toBe(false);
  });

  it("shows a command error and keeps always on top unchanged when the window rejects it", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(getCurrentWindow().setAlwaysOnTop).mockRejectedValueOnce(
      new Error("window unavailable"),
    );
    setDefaultSettings({ alwaysOnTop: false });

    await toggleAlwaysOnTop();

    expect(toastManager.add).toHaveBeenCalledWith({
      description: "window unavailable",
      title: "Could not update always on top.",
      type: "error",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (toggleAlwaysOnTop).",
      expect.any(Error),
    );
    expect(useSettingsStore.getState().alwaysOnTop).toBe(false);
  });

  it("updates appearance theme settings", () => {
    setDefaultSettings({ theme: "system" });

    setDarkTheme();
    expect(useSettingsStore.getState().theme).toBe("dark");

    setLightTheme();
    expect(useSettingsStore.getState().theme).toBe("light");

    setSystemTheme();
    expect(useSettingsStore.getState().theme).toBe("system");
  });

  it("does not start a sort change while another sort change is pending", () => {
    setDefaultSettings({ articleSortOrder: "name" });
    setDefaultUI({ pendingSortOrder: "modifiedDate" });

    sortByType();

    expect(useSettingsStore.getState().articleSortOrder).toBe("name");
  });

  describe("tabs", () => {
    const getActivePath = () => {
      const document = useSessionStore.getState().activeDocument;

      return document?.status === "saved" ? document.path : null;
    };

    it("moves through the tabs in strip order, wrapping at either end", () => {
      setDefaultSession({
        documents: [
          createSavedDocument({ path: "C:/Notes/a.md" }),
          createSavedDocument({ path: "C:/Notes/b.md" }),
          createSavedDocument({ path: "C:/Notes/c.md" }),
        ],
        activeIndex: 2,
      });

      showNextTab();
      expect(getActivePath()).toBe("C:/Notes/a.md");

      showPreviousTab();
      showPreviousTab();
      expect(getActivePath()).toBe("C:/Notes/b.md");

      showTabAt(-1)();
      expect(getActivePath()).toBe("C:/Notes/c.md");

      showTabAt(0)();
      expect(getActivePath()).toBe("C:/Notes/a.md");
    });

    it("offers switching only while another tab is open, and each position only once filled", () => {
      const oneTab = createAppCommandContext({
        tabs: { count: 1, activeIndex: 0, activePreview: false },
      });
      const twoTabs = createAppCommandContext({
        tabs: { count: 2, activeIndex: 0, activePreview: false },
      });

      expect(getSwitchTabState(oneTab).enabled).toBe(false);
      expect(getSwitchTabState(twoTabs).enabled).toBe(true);
      expect(getShowTabAtState(1)(oneTab).enabled).toBe(false);
      expect(getShowTabAtState(1)(twoTabs).enabled).toBe(true);
      expect(getShowTabAtState(-1)(oneTab).enabled).toBe(true);
      expect(getShowTabAtState(-1)(createAppCommandContext()).enabled).toBe(false);
    });

    it("keeps the active preview tab, offered only while the active tab is a preview", () => {
      setDefaultSession({ documents: [createSavedDocument()], previewIndex: 0 });

      keepTab();

      expect(useSessionStore.getState().tabs[0].preview).toBe(false);
      expect(
        getKeepTabState(
          createAppCommandContext({ tabs: { count: 1, activeIndex: 0, activePreview: false } }),
        ).enabled,
      ).toBe(false);
      expect(
        getKeepTabState(
          createAppCommandContext({ tabs: { count: 1, activeIndex: 0, activePreview: true } }),
        ).enabled,
      ).toBe(true);
    });
  });
});
