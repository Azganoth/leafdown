import { setTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toastManager } from "@/lib/toast";

import { App } from "./app";
import {
  recentItemsStoreTauriHandler,
  settingsStoreTauriHandler,
  useSettingsStore,
} from "./features/preferences";
import { createUntitledDocument } from "./test/factories/document";
import { setDefaultSession, setDefaultSettings } from "./test/utils/appStores";
import { getLastDiagnosticPayload } from "./test/utils/diagnostics";
import { dispatchDOMEvent } from "./test/utils/events";
import { render, waitFor } from "./test/utils/react";
import { getWindowListenHandler, getWindowThemeChangedHandler } from "./test/utils/tauri";

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

  it("shows the window and reports the failure when a persisted store fails to start", async () => {
    const appWindow = getCurrentWindow();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const startSettingsStore = vi
      .spyOn(settingsStoreTauriHandler, "start")
      .mockRejectedValue(new Error("Persisted settings are unreadable."));

    try {
      render(<App />);

      await waitFor(() => {
        expect(appWindow.show).toHaveBeenCalled();
      });

      expect(toastManager.add).toHaveBeenCalledWith({
        description: "Persisted settings are unreadable.",
        title: "Could not load preferences.",
        type: "error",
      });
    } finally {
      consoleError.mockRestore();
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

  it("follows native theme changes while the system theme is selected", async () => {
    const appWindow = getCurrentWindow();
    setDefaultSettings({ theme: "system" });

    render(<App />);

    await waitFor(() => {
      expect(appWindow.onThemeChanged).toHaveBeenCalled();
    });

    expect(document.documentElement).not.toHaveClass("dark");

    getWindowThemeChangedHandler()({ payload: "dark" });
    expect(document.documentElement).toHaveClass("dark");

    getWindowThemeChangedHandler()({ payload: "light" });
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("stops following native theme changes after switching to an explicit theme", async () => {
    const appWindow = getCurrentWindow();
    const unlisten = vi.fn();
    vi.mocked(appWindow.onThemeChanged).mockResolvedValue(unlisten);
    setDefaultSettings({ theme: "system" });

    render(<App />);

    await waitFor(() => {
      expect(appWindow.onThemeChanged).toHaveBeenCalledOnce();
    });

    useSettingsStore.getState().updateSetting("theme", "light");

    await waitFor(() => {
      expect(unlisten).toHaveBeenCalledOnce();
    });

    expect(appWindow.onThemeChanged).toHaveBeenCalledOnce();
  });

  it("unlistens native theme changes when setup resolves after unmount", async () => {
    const appWindow = getCurrentWindow();
    const themeListener = Promise.withResolvers<() => void>();
    const unlisten = vi.fn();
    vi.mocked(appWindow.onThemeChanged).mockReturnValue(themeListener.promise);
    setDefaultSettings({ theme: "system" });

    const { unmount } = render(<App />);
    unmount();

    themeListener.resolve(unlisten);

    await waitFor(() => {
      expect(unlisten).toHaveBeenCalledOnce();
    });
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

    const handleCloseRequested = getWindowListenHandler<undefined, Promise<void>>(
      "leafdown://window-close-requested",
    );
    await handleCloseRequested({ payload: undefined });

    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getLastDiagnosticPayload("info")).toMatchObject({
        event: "operationLifecycle",
        feature: "app",
        operation: "window",
        phase: "closing",
      });
    });
    await waitFor(() => expect(appWindow.destroy).toHaveBeenCalledOnce());
    expect(appWindow.emit).not.toHaveBeenCalledWith("leafdown://window-close-declined");
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

    const handleCloseRequested = getWindowListenHandler<undefined, Promise<void>>(
      "leafdown://window-close-requested",
    );
    await handleCloseRequested({ payload: undefined });

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("unsaved changes"),
      expect.objectContaining({ kind: "warning" }),
    );
    expect(appWindow.destroy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(appWindow.emit).toHaveBeenCalledWith("leafdown://window-close-declined");
    });
  });

  it("leaves a failed close request unanswered so the backend fallback can close the window", async () => {
    const appWindow = getCurrentWindow();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(confirm).mockRejectedValue(new Error("Dialog unavailable."));
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true }),
    });

    try {
      render(<App />);

      await waitFor(() => {
        expect(appWindow.listen).toHaveBeenCalledWith(
          "leafdown://window-close-requested",
          expect.any(Function),
        );
      });

      const handleCloseRequested = getWindowListenHandler<undefined, Promise<void>>(
        "leafdown://window-close-requested",
      );
      await handleCloseRequested({ payload: undefined });

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Unexpected error (windowCloseRequested).",
          expect.any(Error),
        );
      });
      expect(appWindow.emit).not.toHaveBeenCalled();
      expect(appWindow.destroy).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
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
