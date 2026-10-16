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
import { useSessionStore, type WindowCloseRequest } from "./features/session";
import { LAUNCH_DOCUMENTS_EVENT } from "./features/session/services/launchDocumentApi";
import {
  createOpenedMarkdownDocument,
  createSavedDocument,
  createUntitledDocument,
} from "./test/factories/document";
import { createEmptyFolderContext } from "./test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH } from "./test/fixtures/paths";
import { setDefaultSession, setDefaultSettings } from "./test/utils/appStores";
import { getLastDiagnosticPayload } from "./test/utils/diagnostics";
import { dispatchDOMEvent } from "./test/utils/events";
import { render, renderWithUser, screen, waitFor, within } from "./test/utils/react";
import { getWindowListenHandler, getWindowThemeChangedHandler } from "./test/utils/tauri";
import { countTauriApiCalls, mockTauriApi, tauriApiCommand } from "./test/utils/tauriApi";

describe("App", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    delete document.documentElement.dataset.accentColor;
    mockTauriApi({ takeLaunchDocumentPaths: () => [] });
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

  it("follows always on top when another window changes the setting", async () => {
    const appWindow = getCurrentWindow();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(<App />);

      await waitFor(() => {
        expect(appWindow.show).toHaveBeenCalled();
      });
      expect(appWindow.setAlwaysOnTop).not.toHaveBeenCalled();

      useSettingsStore.getState().updateSetting("alwaysOnTop", true);

      await waitFor(() => expect(appWindow.setAlwaysOnTop).toHaveBeenLastCalledWith(true));

      vi.mocked(appWindow.setAlwaysOnTop).mockRejectedValueOnce(new Error("window unavailable"));
      useSettingsStore.getState().updateSetting("alwaysOnTop", false);

      await waitFor(() =>
        expect(toastManager.add).toHaveBeenCalledWith({
          description: "window unavailable",
          title: "Could not apply always on top to this window.",
          type: "error",
        }),
      );
    } finally {
      consoleError.mockRestore();
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

    const handleCloseRequested = getWindowListenHandler<WindowCloseRequest, Promise<void>>(
      "leafdown://window-close-requested",
    );
    await handleCloseRequested({ payload: { keepsSession: false } });

    expect(confirmation.useConfirmationStore.getState().current).toBeNull();
    expect(appWindow.setFocus).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getLastDiagnosticPayload("info")).toMatchObject({
        event: "operationLifecycle",
        feature: "app",
        operation: "window",
        phase: "closing",
      });
    });
    await waitFor(() => expect(appWindow.destroy).toHaveBeenCalledOnce());
    expect(countTauriApiCalls("declineWindowClose")).toBe(0);
  });

  it("keeps the native window open when dirty document close is cancelled", async () => {
    const appWindow = getCurrentWindow();
    mockTauriApi({ takeLaunchDocumentPaths: () => [], declineWindowClose: () => undefined });
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

    const handleCloseRequested = getWindowListenHandler<WindowCloseRequest, Promise<void>>(
      "leafdown://window-close-requested",
    );
    const closeRequest = handleCloseRequested({ payload: { keepsSession: false } });
    const prompt = await screen.findByRole("dialog", { name: "Unsaved changes" });
    expect(prompt).toHaveTextContent("Untitled has unsaved changes.");
    // Quit asks each window in turn, so the window asking comes forward first.
    expect(appWindow.unminimize).toHaveBeenCalledOnce();
    expect(appWindow.setFocus).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await closeRequest;
    expect(appWindow.destroy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(countTauriApiCalls("declineWindowClose")).toBe(1);
    });
  });

  it("asks once about every unsaved tab before closing the window", async () => {
    const appWindow = getCurrentWindow();
    mockTauriApi({ takeLaunchDocumentPaths: () => [], declineWindowClose: () => undefined });
    setDefaultSession({
      documents: [
        createUntitledDocument({ isDirty: true }),
        createSavedDocument(),
        createSavedDocument({ path: "C:/Notes/plan.md", isDirty: true }),
      ],
    });

    const { user } = renderWithUser(<App />);

    await waitFor(() => {
      expect(appWindow.listen).toHaveBeenCalledWith(
        "leafdown://window-close-requested",
        expect.any(Function),
      );
    });

    const handleCloseRequested = getWindowListenHandler<WindowCloseRequest, Promise<void>>(
      "leafdown://window-close-requested",
    );
    const cancelledRequest = handleCloseRequested({ payload: { keepsSession: false } });
    const prompt = await screen.findByRole("dialog", { name: "Unsaved changes" });
    expect(prompt).toHaveTextContent("2 documents have unsaved changes.");
    expect(prompt).toHaveTextContent("Untitled");
    expect(prompt).toHaveTextContent("plan.md");
    await user.click(within(prompt).getByRole("button", { name: "Cancel" }));
    await cancelledRequest;

    expect(appWindow.destroy).not.toHaveBeenCalled();
    expect(useSessionStore.getState().tabs).toHaveLength(3);

    const confirmedRequest = handleCloseRequested({ payload: { keepsSession: false } });
    await user.click(await screen.findByRole("button", { name: "Discard all" }));
    await confirmedRequest;

    expect(appWindow.destroy).toHaveBeenCalledOnce();
  });

  it("keeps unsaved documents for the next launch instead of asking when the window closes for good", async () => {
    const appWindow = getCurrentWindow();
    const reports: unknown[] = [];
    mockTauriApi({
      takeLaunchDocumentPaths: () => [],
      reportWindowSession: (args) => {
        reports.push(args);
      },
    });
    setDefaultSession({
      activeDocument: createUntitledDocument({ content: "Draft", isDirty: true }),
    });

    render(<App />);

    await waitFor(() => expect(countTauriApiCalls("reportWindowSession")).toBe(1));

    const handleCloseRequested = getWindowListenHandler<WindowCloseRequest, Promise<void>>(
      "leafdown://window-close-requested",
    );
    await handleCloseRequested({ payload: { keepsSession: true } });

    await waitFor(() => expect(appWindow.destroy).toHaveBeenCalledOnce());
    expect(confirmation.useConfirmationStore.getState().current).toBeNull();
    expect(reports.at(-1)).toMatchObject({
      session: { state: { tabs: [{ kind: "untitled", isDirty: true }] } },
    });
    expect(reports.flatMap((report) => (report as { snapshots: unknown[] }).snapshots)).toEqual([
      { id: expect.any(String), text: "Draft" },
    ]);
  });

  it("asks about unsaved documents as the window closes for good when they cannot be kept", async () => {
    const appWindow = getCurrentWindow();
    let failReports = false;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockTauriApi({
      takeLaunchDocumentPaths: () => [],
      declineWindowClose: () => undefined,
      reportWindowSession: () => {
        if (failReports) {
          throw { kind: "writeFailed", message: "Disk full." };
        }
      },
    });
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true }),
    });

    try {
      const { user } = renderWithUser(<App />);

      await waitFor(() => expect(countTauriApiCalls("reportWindowSession")).toBe(1));
      failReports = true;

      const handleCloseRequested = getWindowListenHandler<WindowCloseRequest, Promise<void>>(
        "leafdown://window-close-requested",
      );
      const closeRequest = handleCloseRequested({ payload: { keepsSession: true } });

      await screen.findByRole("dialog", { name: "Unsaved changes" });
      await user.click(screen.getByRole("button", { name: "Keep editing" }));
      await closeRequest;

      expect(appWindow.destroy).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("asks about unsaved documents as the window closes for good while Restore session is off", async () => {
    mockTauriApi({ takeLaunchDocumentPaths: () => [], declineWindowClose: () => undefined });
    setDefaultSettings({ restoreSession: false });
    setDefaultSession({
      activeDocument: createUntitledDocument({ isDirty: true }),
    });

    const { user } = renderWithUser(<App />);

    await waitFor(() => expect(countTauriApiCalls("clearKeptSession")).toBe(1));

    const handleCloseRequested = getWindowListenHandler<WindowCloseRequest, Promise<void>>(
      "leafdown://window-close-requested",
    );
    const closeRequest = handleCloseRequested({ payload: { keepsSession: true } });

    await screen.findByRole("dialog", { name: "Unsaved changes" });
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    await closeRequest;

    expect(countTauriApiCalls("reportWindowSession")).toBe(0);
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

      const handleCloseRequested = getWindowListenHandler<WindowCloseRequest, Promise<void>>(
        "leafdown://window-close-requested",
      );
      await handleCloseRequested({ payload: { keepsSession: false } });

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          "Unexpected error (windowCloseRequested).",
          expect.any(Error),
        );
      });
      expect(countTauriApiCalls("declineWindowClose")).toBe(0);
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
      takeLaunchDocumentPaths: () => [TEST_MARKDOWN_FILE_PATH],
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
      .mock.calls.findIndex(([command]) => command === tauriApiCommand("takeLaunchDocumentPaths"));

    expect(countTauriApiCalls("takeLaunchDocumentPaths")).toBe(1);
    expect(vi.mocked(appWindow.show).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(invoke).mock.invocationCallOrder[takeCallIndex],
    );
  });

  it("opens the launch document once delayed startup finishes, before its folder scan does", async () => {
    const launchFolderPath = "C:/Users/Ana Lúcia/Notas de reunião";
    const launchDocumentPath = `${launchFolderPath}/日本語 notes.md`;
    const settingsStart = Promise.withResolvers<void>();
    const folderScan = Promise.withResolvers<ReturnType<typeof createEmptyFolderContext>>();
    const startSettingsStore = vi
      .spyOn(settingsStoreTauriHandler, "start")
      .mockReturnValue(settingsStart.promise);
    setDefaultSettings({ sidebarVisible: true });
    mockTauriApi({
      takeLaunchDocumentPaths: () => [launchDocumentPath],
      openMarkdownFile: () =>
        createOpenedMarkdownDocument({
          path: launchDocumentPath,
          parentFolderPath: launchFolderPath,
        }),
      scanMarkdownFolder: () => folderScan.promise,
      watchMarkdownDocument: () => undefined,
      unwatchMarkdownDocument: () => undefined,
      inspectMarkdownFile: () => ({ kind: "unchanged" }),
      watchMarkdownFolder: () => undefined,
      unwatchMarkdownFolder: () => undefined,
    });

    try {
      render(<App />);

      await waitFor(() => expect(startSettingsStore).toHaveBeenCalled());
      expect(countTauriApiCalls("takeLaunchDocumentPaths")).toBe(0);

      settingsStart.resolve();

      await waitFor(() => {
        expect(useSessionStore.getState().activeDocument).toMatchObject({
          path: launchDocumentPath,
        });
      });
      expect(useSessionStore.getState().folderContext).toBeNull();
      expect(await screen.findByText("Loading folder…")).toBeInTheDocument();

      folderScan.resolve(createEmptyFolderContext({ path: launchFolderPath }));

      await waitFor(() => {
        expect(useSessionStore.getState().folderContext).toMatchObject({ path: launchFolderPath });
      });
      expect(screen.queryByText("Loading folder…")).not.toBeInTheDocument();
    } finally {
      startSettingsStore.mockRestore();
    }
  });

  it("opens a document a later launch routes here, listening before the first take", async () => {
    const appWindow = getCurrentWindow();
    const routedPaths: string[][] = [[]];
    mockTauriApi({
      takeLaunchDocumentPaths: () => routedPaths.shift() ?? [],
      openMarkdownFile: () => createOpenedMarkdownDocument(),
      scanMarkdownFolder: () => createEmptyFolderContext(),
    });

    render(<App />);

    await waitFor(() => expect(countTauriApiCalls("takeLaunchDocumentPaths")).toBe(1));

    const listenCallIndex = vi
      .mocked(appWindow.listen)
      .mock.calls.findIndex(([eventName]) => eventName === LAUNCH_DOCUMENTS_EVENT);
    const takeCallIndex = vi
      .mocked(invoke)
      .mock.calls.findIndex(([command]) => command === tauriApiCommand("takeLaunchDocumentPaths"));

    expect(vi.mocked(appWindow.listen).mock.invocationCallOrder[listenCallIndex]).toBeLessThan(
      vi.mocked(invoke).mock.invocationCallOrder[takeCallIndex],
    );
    expect(useSessionStore.getState().activeDocument).toBeNull();

    routedPaths.push([TEST_MARKDOWN_FILE_PATH]);
    getWindowListenHandler<void>(LAUNCH_DOCUMENTS_EVENT)({ payload: undefined });

    await waitFor(() => {
      expect(useSessionStore.getState().activeDocument).toMatchObject({
        path: TEST_MARKDOWN_FILE_PATH,
      });
    });
    expect(countTauriApiCalls("takeLaunchDocumentPaths")).toBe(2);
  });

  it("opens the launch document with default settings when preferences fail to load", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const startSettingsStore = vi
      .spyOn(settingsStoreTauriHandler, "start")
      .mockRejectedValue(new Error("Persisted settings are unreadable."));
    mockTauriApi({
      takeLaunchDocumentPaths: () => [TEST_MARKDOWN_FILE_PATH],
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
