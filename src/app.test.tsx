// @vitest-environment happy-dom

import { setTheme } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as confirmation from "@/lib/confirmation";
import { localizer, PSEUDO_LOCALE } from "@/lib/i18n";
import { toastManager } from "@/lib/toast";

import { App } from "./app";
import {
  recentItemsStoreTauriHandler,
  settingsStoreTauriHandler,
  useSettingsStore,
} from "./features/preferences";
import { releaseNotesStoreTauriHandler } from "./features/release-notes";
import { useSessionStore } from "./features/session";
import { createOpenedMarkdownDocument, createUntitledDocument } from "./test/factories/document";
import { createEmptyFolderContext } from "./test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH } from "./test/fixtures/paths";
import { setDefaultSession, setDefaultSettings } from "./test/utils/appStores";
import { getLastDiagnosticPayload } from "./test/utils/diagnostics";
import { dispatchDOMEvent } from "./test/utils/events";
import { render, renderWithUser, screen, waitFor } from "./test/utils/react";
import { getWindowListenHandler, getWindowThemeChangedHandler } from "./test/utils/tauri";
import { countTauriApiCalls, mockTauriApi, tauriApiCommand } from "./test/utils/tauriApi";

describe("App", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    delete document.documentElement.dataset.accentColor;
    mockTauriApi({ takeLaunchDocumentPath: () => null });
  });

  it("starts persisted stores, applies the theme, and shows the window", async () => {
    const appWindow = getCurrentWindow();
    const startRecentItemsStore = vi.spyOn(recentItemsStoreTauriHandler, "start");
    const startSettingsStore = vi.spyOn(settingsStoreTauriHandler, "start");
    const startReleaseNotesStore = vi.spyOn(releaseNotesStoreTauriHandler, "start");
    vi.mocked(appWindow.theme).mockResolvedValue("dark");

    try {
      render(<App />);

      await waitFor(() => {
        expect(startSettingsStore).toHaveBeenCalled();
        expect(startRecentItemsStore).toHaveBeenCalled();
        expect(startReleaseNotesStore).toHaveBeenCalled();
        expect(appWindow.show).toHaveBeenCalled();
      });

      expect(setTheme).toHaveBeenCalledWith(null);
      expect(document.documentElement).toHaveClass("dark");
    } finally {
      startRecentItemsStore.mockRestore();
      startSettingsStore.mockRestore();
      startReleaseNotesStore.mockRestore();
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

  it("applies persisted always on top after loading settings and before showing the window", async () => {
    const appWindow = getCurrentWindow();
    const startSettingsStore = vi
      .spyOn(settingsStoreTauriHandler, "start")
      .mockImplementation(async () => setDefaultSettings({ alwaysOnTop: true }));

    try {
      render(<App />);

      await waitFor(() => {
        expect(appWindow.show).toHaveBeenCalled();
      });

      expect(appWindow.setAlwaysOnTop).toHaveBeenCalledWith(true);
      expect(vi.mocked(appWindow.setAlwaysOnTop).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(appWindow.show).mock.invocationCallOrder[0],
      );
      expect(useSettingsStore.getState().alwaysOnTop).toBe(true);
    } finally {
      startSettingsStore.mockRestore();
    }
  });

  it("launches with always on top repaired to off and reports a failed startup restore", async () => {
    const appWindow = getCurrentWindow();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(appWindow.setAlwaysOnTop).mockRejectedValueOnce(new Error("window unavailable"));
    const startSettingsStore = vi
      .spyOn(settingsStoreTauriHandler, "start")
      .mockImplementation(async () => setDefaultSettings({ alwaysOnTop: true, theme: "dark" }));

    try {
      render(<App />);

      await waitFor(() => {
        expect(appWindow.show).toHaveBeenCalled();
      });

      expect(useSettingsStore.getState().alwaysOnTop).toBe(false);
      expect(setTheme).toHaveBeenCalledWith("dark");
      expect(toastManager.add).toHaveBeenCalledWith({
        description: "window unavailable",
        title: "Could not restore always on top.",
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

  it("applies the selected accent color to the document root", async () => {
    setDefaultSettings({ accentColor: "violet" });

    render(<App />);

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-accent-color", "violet");
    });

    useSettingsStore.getState().updateSetting("accentColor", "fuchsia");

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-accent-color", "fuchsia");
    });
  });

  it("applies the selected language to the interface and the document root", async () => {
    setDefaultSettings({ language: PSEUDO_LOCALE });

    try {
      render(<App />);

      await waitFor(() => {
        expect(document.documentElement).toHaveAttribute("lang", PSEUDO_LOCALE);
      });
      expect(localizer.current.locale).toBe(PSEUDO_LOCALE);

      useSettingsStore.getState().updateSetting("language", "system");

      await waitFor(() => {
        expect(document.documentElement).toHaveAttribute("lang", "en");
      });
    } finally {
      localizer.setLanguage("en", []);
    }
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

    expect(confirmation.useConfirmationStore.getState().current).toBeNull();
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

    const { user } = renderWithUser(<App />);

    await waitFor(() => {
      expect(appWindow.listen).toHaveBeenCalledWith(
        "leafdown://window-close-requested",
        expect.any(Function),
      );
    });

    const handleCloseRequested = getWindowListenHandler<undefined, Promise<void>>(
      "leafdown://window-close-requested",
    );
    const closeRequest = handleCloseRequested({ payload: undefined });
    const prompt = await screen.findByRole("dialog", { name: "Unsaved changes" });
    expect(prompt).toHaveTextContent("The active document has unsaved changes.");
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await closeRequest;
    expect(appWindow.destroy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(appWindow.emit).toHaveBeenCalledWith("leafdown://window-close-declined");
    });
  });

  it("leaves a failed close request unanswered so the backend fallback can close the window", async () => {
    const appWindow = getCurrentWindow();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failedConfirmation = vi
      .spyOn(confirmation, "requestConfirmation")
      .mockRejectedValue(new Error("Dialog unavailable."));
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
      failedConfirmation.mockRestore();
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

  it("opens the launch document after showing the window", async () => {
    const appWindow = getCurrentWindow();
    mockTauriApi({
      takeLaunchDocumentPath: () => TEST_MARKDOWN_FILE_PATH,
      openMarkdownFile: () => createOpenedMarkdownDocument(),
      scanMarkdownFolder: () => createEmptyFolderContext(),
    });

    render(<App />);

    await waitFor(() => {
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        path: TEST_MARKDOWN_FILE_PATH,
      });
    });

    const takeCallIndex = vi
      .mocked(invoke)
      .mock.calls.findIndex(([command]) => command === tauriApiCommand("takeLaunchDocumentPath"));

    expect(countTauriApiCalls("takeLaunchDocumentPath")).toBe(1);
    expect(vi.mocked(appWindow.show).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(invoke).mock.invocationCallOrder[takeCallIndex],
    );
  });

  it("opens the launch document with default settings when preferences fail to load", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const startSettingsStore = vi
      .spyOn(settingsStoreTauriHandler, "start")
      .mockRejectedValue(new Error("Persisted settings are unreadable."));
    mockTauriApi({
      takeLaunchDocumentPath: () => TEST_MARKDOWN_FILE_PATH,
      openMarkdownFile: () => createOpenedMarkdownDocument(),
      scanMarkdownFolder: () => createEmptyFolderContext(),
    });

    try {
      render(<App />);

      await waitFor(() => {
        expect(useSessionStore.getState().activeDocument).toMatchObject({
          path: TEST_MARKDOWN_FILE_PATH,
        });
      });
    } finally {
      consoleError.mockRestore();
      startSettingsStore.mockRestore();
    }
  });
});
