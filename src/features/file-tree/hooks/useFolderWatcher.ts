import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";
import { toast } from "sonner";

import {
  getOpenMarkdownFolderErrorMessage,
  showDocumentIoErrorToast,
} from "@/lib/documentIoErrors";
import { scanMarkdownFolder } from "@/lib/openMarkdownFolder";
import { useSessionStore } from "@/stores/session";
import { useSettingsStore } from "@/stores/settings";
import { unwatchMarkdownFolder, watchMarkdownFolder } from "../utils/folderWatcherBackend";

interface FolderChangedEventPayload {
  folderPath: string;
  paths: string[];
}

const folderChangedEvent = "leafdown://folder-changed";
const folderWatchRefreshDelayMs = 150;
const ignoredDirectoriesSignatureSeparator = "\u0000";
let nextFolderWatcherScopeGeneration = 0;

export function useFolderWatcher() {
  const folderPath = useSessionStore((state) => state.folderContext?.path ?? null);
  const ignoredDirectoriesSignature = useSettingsStore((state) =>
    state.ignoredDirectories.join(ignoredDirectoriesSignatureSeparator),
  );

  useEffect(() => {
    if (!folderPath) {
      return;
    }

    const appWindow = getCurrentWindow();
    const ignoredDirectories = ignoredDirectoriesFromSignature(ignoredDirectoriesSignature);
    const folderWatcherScope = createFolderWatcherScope();
    let disposed = false;
    let refreshInFlight = false;
    let refreshQueued = false;
    let refreshTimeoutId: number | undefined;
    let unlisten: (() => void) | undefined;

    const clearRefreshTimeout = () => {
      if (refreshTimeoutId === undefined) {
        return;
      }

      window.clearTimeout(refreshTimeoutId);
      refreshTimeoutId = undefined;
    };

    const refreshFolderContext = async () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;

      try {
        if (useSessionStore.getState().folderContext?.path !== folderPath) {
          return;
        }

        const nextFolderContext = await scanMarkdownFolder(folderPath);

        if (!disposed && useSessionStore.getState().folderContext?.path === folderPath) {
          useSessionStore.getState().setFolderContext(nextFolderContext);
        }
      } catch (error) {
        if (!disposed && useSessionStore.getState().folderContext?.path === folderPath) {
          showDocumentIoErrorToast(
            toast.error,
            getOpenMarkdownFolderErrorMessage({ kind: "scanFailed", error }),
          );
        }
      } finally {
        refreshInFlight = false;

        if (refreshQueued && !disposed) {
          refreshQueued = false;
          scheduleRefresh();
        }
      }
    };

    const scheduleRefresh = () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      if (refreshTimeoutId !== undefined) {
        return;
      }

      refreshTimeoutId = window.setTimeout(() => {
        refreshTimeoutId = undefined;
        void refreshFolderContext();
      }, folderWatchRefreshDelayMs);
    };

    void appWindow
      .listen<FolderChangedEventPayload>(folderChangedEvent, (event) => {
        if (
          event.payload.folderPath !== folderPath ||
          useSessionStore.getState().folderContext?.path !== folderPath
        ) {
          return;
        }

        scheduleRefresh();
      })
      .then((folderChangedUnlisten) => {
        if (disposed) {
          folderChangedUnlisten();
          return;
        }

        unlisten = folderChangedUnlisten;
      })
      .catch(console.error);

    void watchMarkdownFolder(
      folderPath,
      ignoredDirectories,
      folderWatcherScope.id,
      folderWatcherScope.generation,
    ).catch((error: unknown) => {
      if (!disposed && useSessionStore.getState().folderContext?.path === folderPath) {
        showDocumentIoErrorToast(toast.error, {
          title: "Could not watch folder.",
          description: getWatchErrorDescription(error),
        });
      }
    });

    return () => {
      disposed = true;
      clearRefreshTimeout();
      unlisten?.();
      void unwatchMarkdownFolder(folderWatcherScope.id, folderWatcherScope.generation).catch(
        console.error,
      );
    };
  }, [folderPath, ignoredDirectoriesSignature]);
}

const createFolderWatcherScope = () => {
  nextFolderWatcherScopeGeneration += 1;

  return {
    generation: nextFolderWatcherScopeGeneration,
    id: `folder-watch:${nextFolderWatcherScopeGeneration}`,
  };
};

const ignoredDirectoriesFromSignature = (signature: string) =>
  signature ? signature.split(ignoredDirectoriesSignatureSeparator) : [];

const getWatchErrorDescription = (error: unknown) => {
  if (!isWatchError(error)) {
    return undefined;
  }

  return "message" in error ? error.message : error.path;
};

const isWatchError = (error: unknown): error is { kind: string; message?: string; path?: string } =>
  typeof error === "object" && error !== null && "kind" in error && typeof error.kind === "string";
