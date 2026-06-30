import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import {
  FOLDER_CONTEXT_CHANGED_EVENT,
  FOLDER_CONTEXT_WATCH_ERROR_EVENT,
  type FolderContextChangedEventPayload,
  type FolderContextWatchErrorEventPayload,
  getScanFolderContextErrorMessage,
  getWatchFolderContextErrorMessage,
  isScanFolderContextError,
  isWatchFolderContextError,
  scanFolderContext,
  unwatchFolderContext,
  watchFolderContext,
} from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { DebouncedTaskRunner } from "@/lib/async";
import { type CancellationToken, isCancellationError } from "@/lib/cancellation";
import { handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { DisposableMap } from "@/lib/lifecycle";
import { isSamePath } from "@/lib/path";
import { notifyError } from "@/lib/toast";

import { useSessionStore } from "../stores/session";

export const FOLDER_WATCH_REFRESH_DELAY_MS = 150;
const IGNORED_DIRECTORIES_SIGNATURE_SEPARATOR = "\u0000";
let nextFolderWatcherScopeGeneration = 0;

type FolderContextWatchListener = "folderChanged" | "watchError";

export const useFolderContextWatcher = () => {
  const folderPath = useSessionStore((state) => state.folderContext?.path ?? null);
  const ignoredDirectoriesSignature = useSettingsStore((state) =>
    state.ignoredDirectories.join(IGNORED_DIRECTORIES_SIGNATURE_SEPARATOR),
  );

  useEffect(() => {
    if (!folderPath) {
      return;
    }

    const ignoredDirectories = ignoredDirectoriesFromSignature(ignoredDirectoriesSignature);
    const session = new FolderContextWatchSession(folderPath, ignoredDirectories);
    session.start();

    return () => {
      session.dispose();
    };
  }, [folderPath, ignoredDirectoriesSignature]);
};

const createFolderWatcherScope = () => {
  nextFolderWatcherScopeGeneration += 1;

  return {
    generation: nextFolderWatcherScopeGeneration,
    id: `folder-watch:${nextFolderWatcherScopeGeneration}`,
  };
};

const ignoredDirectoriesFromSignature = (signature: string) =>
  signature ? signature.split(IGNORED_DIRECTORIES_SIGNATURE_SEPARATOR) : [];

class FolderContextWatchSession {
  private readonly appWindow = getCurrentWindow();
  private readonly nativeWatchScope = createFolderWatcherScope();
  private readonly refreshRunner = new DebouncedTaskRunner(
    (cancellationToken) => this.refreshFolderContext(cancellationToken),
    FOLDER_WATCH_REFRESH_DELAY_MS,
  );
  private isStarted = false;
  private isDisposed = false;
  private readonly listenerDisposables = new DisposableMap<
    FolderContextWatchListener,
    () => void
  >();

  constructor(
    private readonly folderPath: string,
    private readonly ignoredDirectories: string[],
  ) {}

  start() {
    if (this.isStarted || this.isDisposed) {
      return;
    }

    this.isStarted = true;

    void this.listenAndStartWatcher().catch((error) => {
      this.listenerDisposables.clear();
      this.reportStartFailure(error);
    });
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.refreshRunner.dispose();
    this.listenerDisposables.dispose();
    void unwatchFolderContext(this.nativeWatchScope.id, this.nativeWatchScope.generation).catch(
      (error) => handleUnexpectedError(error, "unwatchFolderContext"),
    );
  }

  private isActiveFolderContext() {
    const activeFolderPath = useSessionStore.getState().folderContext?.path;

    return (
      activeFolderPath !== undefined &&
      !this.isDisposed &&
      isSamePath(activeFolderPath, this.folderPath)
    );
  }

  private async refreshFolderContext(cancellationToken: CancellationToken) {
    try {
      if (!this.isActiveFolderContext()) {
        return;
      }

      const nextFolderContext = await scanFolderContext(
        this.folderPath,
        {
          ignoredDirectories: this.ignoredDirectories,
          sortOrder: useSettingsStore.getState().articleSortOrder,
        },
        cancellationToken,
      );

      if (this.isActiveFolderContext()) {
        useSessionStore.getState().setFolderContext(nextFolderContext);
      }
    } catch (error) {
      if (isCancellationError(error)) {
        return;
      }

      if (!this.isActiveFolderContext()) {
        return;
      }

      if (isScanFolderContextError(error)) {
        notifyError(getScanFolderContextErrorMessage(error));
        return;
      }

      notifyOperationFailure("Could not refresh folder.", error, "refreshFolderContext");
    }
  }

  private requestRefresh() {
    void this.refreshRunner.run().catch((error) => {
      if (!isCancellationError(error)) {
        handleUnexpectedError(error, "refreshFolderContext");
      }
    });
  }

  private async listenAndStartWatcher() {
    this.listenerDisposables.set(
      "folderChanged",
      await this.appWindow.listen<FolderContextChangedEventPayload>(
        FOLDER_CONTEXT_CHANGED_EVENT,
        (event) => {
          if (
            !isSamePath(event.payload.folderPath, this.folderPath) ||
            !this.isActiveFolderContext()
          ) {
            return;
          }

          this.requestRefresh();
        },
      ),
    );

    if (this.isDisposed) {
      return;
    }

    this.listenerDisposables.set(
      "watchError",
      await this.appWindow.listen<FolderContextWatchErrorEventPayload>(
        FOLDER_CONTEXT_WATCH_ERROR_EVENT,
        (event) => {
          if (
            !isSamePath(event.payload.folderPath, this.folderPath) ||
            !this.isActiveFolderContext()
          ) {
            return;
          }

          notifyError(getWatchFolderContextErrorMessage(event.payload.error));
        },
      ),
    );

    if (this.isDisposed) {
      return;
    }

    await watchFolderContext(
      this.folderPath,
      this.ignoredDirectories,
      this.nativeWatchScope.id,
      this.nativeWatchScope.generation,
    );
  }

  private reportStartFailure(error: unknown) {
    if (!this.isActiveFolderContext()) {
      return;
    }

    if (isWatchFolderContextError(error)) {
      notifyError(getWatchFolderContextErrorMessage(error));
      return;
    }

    notifyOperationFailure("Could not start folder watcher.", error, "startFolderContextWatcher");
  }
}
