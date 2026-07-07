import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FOLDER_CONTEXT_CHANGED_EVENT,
  FOLDER_CONTEXT_WATCH_ERROR_EVENT,
  type FolderContextChangedEventPayload,
  type FolderContextWatchErrorEventPayload,
} from "@/features/folder-context";
import { createFolderContext } from "@/test/factories/folderContext";
import { setDefaultSession, setDefaultSettings } from "@/test/utils/appStores";
import { act, renderHook, waitFor } from "@/test/utils/react";
import { getWindowListenHandler } from "@/test/utils/tauri";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { useSessionStore } from "../stores/session";
import {
  FOLDER_WATCH_REFRESH_DELAY_MS,
  resetFolderWatcherScopeGenerationForTests,
  useFolderContextWatcher,
} from "./useFolderContextWatcher";

const notesFolderContext = createFolderContext();
const notesFolderTree = notesFolderContext.tree;

interface FolderContextWatchScope {
  generation: number;
  id: string;
}

const getFolderChangedHandler = () =>
  getWindowListenHandler<FolderContextChangedEventPayload>(FOLDER_CONTEXT_CHANGED_EVENT);

const getFolderWatchErrorHandler = () =>
  getWindowListenHandler<FolderContextWatchErrorEventPayload>(FOLDER_CONTEXT_WATCH_ERROR_EVENT);

const createFolderContextChangedEvent = (
  payload: Partial<FolderContextChangedEventPayload> = {},
) => ({
  payload: {
    folderPath: "C:/Notes",
    paths: ["C:/Notes/new.md"],
    ...payload,
  },
});

const createFolderContextWatchErrorEvent = (
  payload: Partial<FolderContextWatchErrorEventPayload> = {},
) => ({
  payload: {
    folderPath: "C:/Notes",
    error: {
      kind: "watchFailed" as const,
      path: "C:/Notes",
      message: "watch failed",
    },
    ...payload,
  },
});

const latestFolderContextWatchScope = (): FolderContextWatchScope => {
  const watchArgs = getLastTauriApiArgs("watchMarkdownFolder");

  return {
    generation: watchArgs.scopeGeneration,
    id: watchArgs.scopeId,
  };
};

const advanceFolderRefreshTimer = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(FOLDER_WATCH_REFRESH_DELAY_MS);
  });
};

describe("useFolderContextWatcher", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockReset();
    resetFolderWatcherScopeGenerationForTests();
    mockTauriApi({
      watchMarkdownFolder: () => undefined,
      unwatchMarkdownFolder: () => undefined,
    });
  });

  describe("watch lifecycle", () => {
    it("does not start a watcher without an active folder context", () => {
      renderHook(() => useFolderContextWatcher());

      expect(getCurrentWindow().listen).not.toHaveBeenCalled();
      expect(countTauriApiCalls("watchMarkdownFolder")).toBe(0);
    });

    it("starts the native watcher and cleans it up on unmount", async () => {
      const unlisten = vi.fn();
      vi.mocked(getCurrentWindow().listen).mockResolvedValue(unlisten);
      setDefaultSettings({ ignoredDirectories: [".git", "vendor"] });
      setDefaultSession({ folderContext: notesFolderContext });

      const { unmount } = renderHook(() => useFolderContextWatcher());

      await waitFor(() => {
        expect(getCurrentWindow().listen).toHaveBeenCalledWith(
          FOLDER_CONTEXT_CHANGED_EVENT,
          expect.any(Function),
        );
        expect(getCurrentWindow().listen).toHaveBeenCalledWith(
          FOLDER_CONTEXT_WATCH_ERROR_EVENT,
          expect.any(Function),
        );
        expect(getLastTauriApiArgs("watchMarkdownFolder")).toEqual({
          path: "C:/Notes",
          ignoredDirectories: [".git", "vendor"],
          scopeId: expect.stringMatching(/^folder-watch:/u),
          scopeGeneration: expect.any(Number),
        });
      });
      const scope = latestFolderContextWatchScope();

      unmount();

      expect(unlisten).toHaveBeenCalledTimes(2);
      expect(getLastTauriApiArgs("unwatchMarkdownFolder")).toEqual({
        scopeId: scope.id,
        scopeGeneration: scope.generation,
      });
    });

    it("starts the native watcher only after folder watcher events are listening", async () => {
      const unlistenFolderChanged = vi.fn();
      const unlistenFolderWatchError = vi.fn();
      const folderChangedListen = Promise.withResolvers<() => void>();
      const folderWatchErrorListen = Promise.withResolvers<() => void>();
      vi.mocked(getCurrentWindow().listen).mockImplementation((eventName) => {
        if (eventName === FOLDER_CONTEXT_CHANGED_EVENT) {
          return folderChangedListen.promise;
        }

        if (eventName === FOLDER_CONTEXT_WATCH_ERROR_EVENT) {
          return folderWatchErrorListen.promise;
        }

        return Promise.resolve(vi.fn());
      });
      setDefaultSession({ folderContext: notesFolderContext });

      renderHook(() => useFolderContextWatcher());

      expect(countTauriApiCalls("watchMarkdownFolder")).toBe(0);
      folderChangedListen.resolve(unlistenFolderChanged);

      await waitFor(() => {
        expect(getCurrentWindow().listen).toHaveBeenCalledWith(
          FOLDER_CONTEXT_WATCH_ERROR_EVENT,
          expect.any(Function),
        );
      });
      expect(countTauriApiCalls("watchMarkdownFolder")).toBe(0);

      folderWatchErrorListen.resolve(unlistenFolderWatchError);

      await waitFor(() => {
        expect(countTauriApiCalls("watchMarkdownFolder")).toBe(1);
      });
    });

    it("unlistens folder change events when listener setup resolves after unmount", async () => {
      const unlisten = vi.fn();
      const listenDeferred = Promise.withResolvers<() => void>();
      vi.mocked(getCurrentWindow().listen).mockReturnValue(listenDeferred.promise);
      setDefaultSession({ folderContext: notesFolderContext });

      const { unmount } = renderHook(() => useFolderContextWatcher());

      unmount();
      listenDeferred.resolve(unlisten);

      await waitFor(() => expect(unlisten).toHaveBeenCalledTimes(1));
    });

    it("unlistens folder watcher error events when listener setup resolves after unmount", async () => {
      const unlistenFolderChanged = vi.fn();
      const unlistenFolderWatchError = vi.fn();
      const folderWatchErrorListen = Promise.withResolvers<() => void>();
      vi.mocked(getCurrentWindow().listen).mockImplementation((eventName) => {
        if (eventName === FOLDER_CONTEXT_CHANGED_EVENT) {
          return Promise.resolve(unlistenFolderChanged);
        }

        if (eventName === FOLDER_CONTEXT_WATCH_ERROR_EVENT) {
          return folderWatchErrorListen.promise;
        }

        return Promise.resolve(vi.fn());
      });
      setDefaultSession({ folderContext: notesFolderContext });

      const { unmount } = renderHook(() => useFolderContextWatcher());

      await waitFor(() => {
        expect(getCurrentWindow().listen).toHaveBeenCalledWith(
          FOLDER_CONTEXT_WATCH_ERROR_EVENT,
          expect.any(Function),
        );
      });
      unmount();
      folderWatchErrorListen.resolve(unlistenFolderWatchError);

      await waitFor(() => expect(unlistenFolderWatchError).toHaveBeenCalledTimes(1));
      expect(unlistenFolderChanged).toHaveBeenCalledTimes(1);
      expect(countTauriApiCalls("watchMarkdownFolder")).toBe(0);
    });

    it("reports unexpected listener setup failures", async () => {
      const error = new Error("listen failed");
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.mocked(getCurrentWindow().listen).mockRejectedValue(error);
      setDefaultSession({ folderContext: notesFolderContext });

      try {
        renderHook(() => useFolderContextWatcher());

        await waitFor(() => {
          expect(toast.error).toHaveBeenCalledWith("Could not start folder watcher.", {
            description: "listen failed",
          });
          expect(consoleError).toHaveBeenCalledWith(
            "Unexpected error (startFolderContextWatcher).",
            error,
          );
        });
        expect(countTauriApiCalls("watchMarkdownFolder")).toBe(0);
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("folder change refreshes", () => {
    describe("debounced refreshes", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("refreshes the active folder context from matching folder change events", async () => {
        const refreshedFolderTree = {
          ...notesFolderTree,
          children: [
            ...notesFolderTree.children,
            {
              kind: "file" as const,
              name: "new.md",
              path: "C:/Notes/new.md",
            },
          ],
        };
        setDefaultSettings({ articleSortOrder: "type", ignoredDirectories: [".git"] });
        setDefaultSession({ folderContext: notesFolderContext });
        mockTauriApi({
          scanMarkdownFolder: () =>
            createFolderContext({
              tree: refreshedFolderTree,
            }),
          watchMarkdownFolder: () => undefined,
          unwatchMarkdownFolder: () => undefined,
        });

        renderHook(() => useFolderContextWatcher());

        getFolderChangedHandler()(createFolderContextChangedEvent({ folderPath: "c:\\notes\\" }));

        expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);

        await advanceFolderRefreshTimer();

        expect(getLastTauriApiArgs("scanMarkdownFolder")).toEqual({
          path: "C:/Notes",
          ignoredDirectories: [".git"],
          sortOrder: "type",
        });
        expect(useSessionStore.getState().folderContext).toMatchObject({
          path: "C:/Notes",
          tree: refreshedFolderTree,
        });
      });

      it("coalesces folder change events that arrive during the debounce window", async () => {
        setDefaultSession({ folderContext: notesFolderContext });
        mockTauriApi({
          scanMarkdownFolder: () => notesFolderContext,
          watchMarkdownFolder: () => undefined,
          unwatchMarkdownFolder: () => undefined,
        });

        renderHook(() => useFolderContextWatcher());

        getFolderChangedHandler()(createFolderContextChangedEvent());

        await act(async () => {
          await vi.advanceTimersByTimeAsync(FOLDER_WATCH_REFRESH_DELAY_MS - 1);
        });

        getFolderChangedHandler()(
          createFolderContextChangedEvent({ paths: ["C:/Notes/other.md"] }),
        );

        expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(FOLDER_WATCH_REFRESH_DELAY_MS - 1);
        });

        expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1);
        });

        expect(countTauriApiCalls("scanMarkdownFolder")).toBe(1);
      });

      it("queues one follow-up refresh when folder changes arrive during a refresh", async () => {
        const firstScan = Promise.withResolvers<ReturnType<typeof createFolderContext>>();
        const scanMarkdownFolder = vi.fn(() => {
          if (scanMarkdownFolder.mock.calls.length === 1) {
            return firstScan.promise;
          }

          return notesFolderContext;
        });
        setDefaultSession({ folderContext: notesFolderContext });
        mockTauriApi({
          scanMarkdownFolder,
          watchMarkdownFolder: () => undefined,
          unwatchMarkdownFolder: () => undefined,
        });

        renderHook(() => useFolderContextWatcher());

        getFolderChangedHandler()(createFolderContextChangedEvent());
        await advanceFolderRefreshTimer();

        expect(scanMarkdownFolder).toHaveBeenCalledTimes(1);

        getFolderChangedHandler()(
          createFolderContextChangedEvent({ paths: ["C:/Notes/other.md"] }),
        );
        firstScan.resolve(notesFolderContext);

        await act(async () => {
          await firstScan.promise;
        });
        expect(scanMarkdownFolder).toHaveBeenCalledTimes(1);

        await advanceFolderRefreshTimer();

        expect(scanMarkdownFolder).toHaveBeenCalledTimes(2);
      });

      it("shows scan errors from matching folder change events", async () => {
        setDefaultSession({ folderContext: notesFolderContext });
        mockTauriApi({
          scanMarkdownFolder: () =>
            Promise.reject({
              kind: "readDirectoryFailed",
              path: "C:/Notes",
              message: "access failed",
            }),
          watchMarkdownFolder: () => undefined,
          unwatchMarkdownFolder: () => undefined,
        });

        renderHook(() => useFolderContextWatcher());

        getFolderChangedHandler()(createFolderContextChangedEvent());

        await advanceFolderRefreshTimer();

        expect(toast.error).toHaveBeenCalledWith("Could not read folder.", {
          description: "access failed",
        });
        expect(useSessionStore.getState().folderContext).toMatchObject({
          path: "C:/Notes",
          tree: notesFolderTree,
        });
      });

      it("reports unexpected scan failures from matching folder change events", async () => {
        const error = new Error("scan crashed");
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        setDefaultSession({ folderContext: notesFolderContext });
        mockTauriApi({
          scanMarkdownFolder: () => Promise.reject(error),
          watchMarkdownFolder: () => undefined,
          unwatchMarkdownFolder: () => undefined,
        });

        try {
          renderHook(() => useFolderContextWatcher());

          getFolderChangedHandler()(createFolderContextChangedEvent());

          await advanceFolderRefreshTimer();

          expect(toast.error).toHaveBeenCalledWith("Could not refresh folder.", {
            description: "scan crashed",
          });
          expect(consoleError).toHaveBeenCalledWith(
            "Unexpected error (refreshFolderContext).",
            error,
          );
          expect(useSessionStore.getState().folderContext).toMatchObject({
            path: "C:/Notes",
            tree: notesFolderTree,
          });
        } finally {
          consoleError.mockRestore();
        }
      });
    });

    it("ignores folder change events for other folder contexts", () => {
      setDefaultSession({ folderContext: notesFolderContext });

      renderHook(() => useFolderContextWatcher());

      getFolderChangedHandler()(
        createFolderContextChangedEvent({
          folderPath: "C:/Archive",
          paths: ["C:/Archive/new.md"],
        }),
      );

      expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);
    });

    it("ignores queued watcher callbacks after cleanup", async () => {
      setDefaultSession({ folderContext: notesFolderContext });

      const { unmount } = renderHook(() => useFolderContextWatcher());

      await waitFor(() => {
        expect(getCurrentWindow().listen).toHaveBeenCalledWith(
          FOLDER_CONTEXT_WATCH_ERROR_EVENT,
          expect.any(Function),
        );
      });
      const handleFolderChanged = getFolderChangedHandler();
      const handleFolderWatchError = getFolderWatchErrorHandler();

      unmount();
      handleFolderChanged(createFolderContextChangedEvent());
      handleFolderWatchError(createFolderContextWatchErrorEvent());

      expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe("watcher errors", () => {
    it("shows runtime watcher errors for the active folder context", async () => {
      setDefaultSession({ folderContext: notesFolderContext });

      renderHook(() => useFolderContextWatcher());

      await waitFor(() => {
        expect(getCurrentWindow().listen).toHaveBeenCalledWith(
          FOLDER_CONTEXT_WATCH_ERROR_EVENT,
          expect.any(Function),
        );
      });
      getFolderWatchErrorHandler()(createFolderContextWatchErrorEvent());

      expect(toast.error).toHaveBeenCalledWith("Could not watch folder.", {
        description: "watch failed",
      });
    });
  });
});
