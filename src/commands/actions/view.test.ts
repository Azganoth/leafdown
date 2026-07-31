import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { useArticleNavigatorStore } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { createAppCommandContext } from "@/test/factories/commands";
import { createFolderContextWithNestedReadme } from "@/test/factories/folderContext";
import { TEST_NESTED_DIRECTORY_PATH } from "@/test/fixtures/paths";
import { setDefaultSettings, setDefaultUI } from "@/test/utils/appStores";

import { useCommandUIStore } from "../stores/commandUi";
import {
  collapseAllFolders,
  expandAllFolders,
  resetZoom,
  setDarkTheme,
  setLightTheme,
  setSystemTheme,
  sortByType,
  toggleFullscreen,
  toggleSidebar,
  zoomIn,
  zoomOut,
} from "./view";

describe("view actions", () => {
  it("toggles the sidebar visibility", () => {
    setDefaultSettings({ sidebarVisible: true });
    toggleSidebar();
    expect(useSettingsStore.getState().sidebarVisible).toBe(false);
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
      expect(toast.error).toHaveBeenCalledWith("Could not update zoom.", {
        description: "webview unavailable",
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
      expect(toast.error).toHaveBeenCalledWith("Could not update fullscreen mode.", {
        description: "window unavailable",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Unexpected error (toggleFullscreen).",
        expect.any(Error),
      );
    });
    expect(useCommandUIStore.getState().fullscreen).toBe(true);
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
});
