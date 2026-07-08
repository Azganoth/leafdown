import { setTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { info as writeLogInfo } from "@tauri-apps/plugin-log";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import {
  recentItemsStoreTauriHandler,
  settingsStoreTauriHandler,
  useSettingsStore,
} from "./features/preferences";
import { createUntitledDocument } from "./test/factories/document";
import { setDefaultSession, setDefaultSettings } from "./test/utils/appStores";
import { dispatchDOMEvent } from "./test/utils/events";
import { render, waitFor } from "./test/utils/react";
import { getWindowListenHandler } from "./test/utils/tauri";

describe("App", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("starts persisted stores, applies the theme, and shows the window", async () => {
    const appWindow = getCurrentWindow();
    const startRecentItemsStore = vi.spyOn(recentItemsStoreTauriHandler, "start");
    const startSettingsStore = vi.spyOn(settingsStoreTauriHandler, "start");
    vi.mocked(appWindow.theme).mockResolvedValue("dark");

    try {
      render(<App />);

      await waitFor(() => {
        expect(startSettingsStore).toHaveBeenCalled();
        expect(startRecentItemsStore).toHaveBeenCalled();
        expect(appWindow.show).toHaveBeenCalled();
      });

      expect(setTheme).toHaveBeenCalledWith(null);
      expect(document.documentElement).toHaveClass("dark");
    } finally {
      startRecentItemsStore.mockRestore();
      startSettingsStore.mockRestore();
    }
  });

  it("syncs explicit theme settings without reading the native window theme", async () => {
    const appWindow = getCurrentWindow();
    setDefaultSettings({ theme: "dark" });

    render(<App />);

    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith("dark");
    });

    expect(appWindow.theme).not.toHaveBeenCalled();
    expect(document.documentElement).toHaveClass("dark");

    useSettingsStore.getState().updateSetting("theme", "light");

    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith("light");
    });

    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("destroys the native window after a clean backend close request", async () => {
    const appWindow = getCurrentWindow();

    render(<App />);

    await waitFor(() => {
      expect(appWindow.listen).toHaveBeenCalledWith(
        "leafdown://window-close-requested",
        expect.any(Function),
      );
    });

    const handleCloseRequested = getWindowListenHandler("leafdown://window-close-requested");
    await handleCloseRequested({ payload: undefined });

    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(JSON.parse(vi.mocked(writeLogInfo).mock.calls.at(-1)?.[0] ?? "{}")).toMatchObject({
        event: "appClosing",
        feature: "app",
        operation: "windowCloseRequested",
        reason: "windowCloseRequested",
      });
    });
    await waitFor(() => expect(appWindow.destroy).toHaveBeenCalledOnce());
  });

  it("keeps the native window open when dirty document close is cancelled", async () => {
    const appWindow = getCurrentWindow();
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true }),
    });

    render(<App />);

    await waitFor(() => {
      expect(appWindow.listen).toHaveBeenCalledWith(
        "leafdown://window-close-requested",
        expect.any(Function),
      );
    });

    const handleCloseRequested = getWindowListenHandler("leafdown://window-close-requested");
    await handleCloseRequested({ payload: undefined });

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("unsaved changes"),
      expect.objectContaining({ kind: "warning" }),
    );
    expect(appWindow.destroy).not.toHaveBeenCalled();
  });

  it("unlistens backend close request events when setup resolves after unmount", async () => {
    const appWindow = getCurrentWindow();
    const closeListener = Promise.withResolvers<() => void>();
    const unlisten = vi.fn();

    vi.mocked(appWindow.listen).mockImplementation((eventName) => {
      if (eventName === "leafdown://window-close-requested") {
        return closeListener.promise;
      }

      return Promise.resolve(vi.fn());
    });

    const { unmount } = render(<App />);
    unmount();

    closeListener.resolve(unlisten);

    await waitFor(() => {
      expect(unlisten).toHaveBeenCalledOnce();
    });
  });

  it("suppresses default window drag and drop navigation", () => {
    render(<App />);

    const dragover = dispatchDOMEvent(window, "dragover");
    const drop = dispatchDOMEvent(window, "drop");

    expect(dragover.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
  });
});
