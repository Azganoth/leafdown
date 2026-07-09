import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import {
  writeDiagnosticOperationFailure,
  writeDiagnosticOperationLifecycle,
  writeDiagnosticOperationWarning,
} from "@/features/diagnostics";
import {
  FOLDER_CONTEXT_CHANGED_EVENT,
  FOLDER_CONTEXT_WATCH_ERROR_EVENT,
  type FolderContextChangedEventPayload,
  type FolderContextWatchErrorEventPayload,
  getScanFolderContextErrorMessage,
  getWatchFolderContextErrorMessage,
  isScanFolderContextError,
  isWatchFolderContextError,
  type WatchFolderContextError,
  scanFolderContext,
  unwatchMarkdownFolder,
  watchMarkdownFolder,
} from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { DebouncedTaskRunner } from "@/lib/async";
import { type CancellationToken, isCancellationError } from "@/lib/cancellation";
import { getErrorDescription, handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { DisposableMap } from "@/lib/lifecycle";
import { isSamePath } from "@/lib/path";
import { notifyError } from "@/lib/toast";

import { useSessionStore } from "../stores/session";

export const FOLDER_WATCH_REFRESH_DELAY_MS = 150;
const IGNORED_DIRECTORIES_SIGNATURE_SEPARATOR = "\u0000";
let nextFolderWatcherScopeGeneration = 0;

type FolderContextWatchListener = "folderChanged" | "watchError";
type FolderContextWatcherLifecyclePhase = "started" | "starting" | "stopped" | "stopping";
type FolderContextWatcherFailurePhase = "starting" | "stopping";

export const resetFolderWatcherScopeGenerationForTests = () => {
  nextFolderWatcherScopeGeneration = 0;
};

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
  private isNativeWatcherStarted = false;
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
    this.writeLifecycleDiagnostic("starting");

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

    const shouldLogNativeStop = this.isNativeWatcherStarted;

    if (shouldLogNativeStop) {
      this.writeLifecycleDiagnostic("stopping");
    }

    void unwatchMarkdownFolder({
      scopeId: this.nativeWatchScope.id,
      scopeGeneration: this.nativeWatchScope.generation,
    })
      .then(() => {
        if (shouldLogNativeStop) {
          this.writeLifecycleDiagnostic("stopped");
        }
      })
      .catch((error) => {
        this.writeFailureDiagnostic("stopping", {
          errorMessage: getErrorDescription(error),
          wasNativeWatcherStarted: shouldLogNativeStop,
        });
        handleUnexpectedError(error, "unwatchMarkdownFolder");
      });
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

          this.writeWarningDiagnostic({
            ...getWatchErrorDiagnosticContext(event.payload.error),
            warningKind: "watchError",
          });
          notifyError(getWatchFolderContextErrorMessage(event.payload.error));
        },
      ),
    );

    if (this.isDisposed) {
      return;
    }

    await watchMarkdownFolder({
      path: this.folderPath,
      ignoredDirectories: this.ignoredDirectories,
      scopeId: this.nativeWatchScope.id,
      scopeGeneration: this.nativeWatchScope.generation,
    });

    if (!this.isDisposed) {
      this.isNativeWatcherStarted = true;
      this.writeLifecycleDiagnostic("started");
    }
  }

  private reportStartFailure(error: unknown) {
    if (!this.isActiveFolderContext()) {
      return;
    }

    if (isWatchFolderContextError(error)) {
      this.writeFailureDiagnostic("starting", getWatchErrorDiagnosticContext(error));
      notifyError(getWatchFolderContextErrorMessage(error));
      return;
    }

    notifyOperationFailure("Could not start folder watcher.", error, "startFolderContextWatcher");
  }

  private writeLifecycleDiagnostic(phase: FolderContextWatcherLifecyclePhase) {
    writeDiagnosticOperationLifecycle({
      context: this.getDiagnosticContext(),
      feature: "folder-context",
      operation: "folderContextWatcher",
      phase,
    });
  }

  private writeFailureDiagnostic(
    phase: FolderContextWatcherFailurePhase,
    context: Record<string, boolean | number | string | undefined> = {},
  ) {
    writeDiagnosticOperationFailure({
      context: {
        ...this.getDiagnosticContext(),
        ...context,
        phase,
      },
      feature: "folder-context",
      operation: "folderContextWatcher",
    });
  }

  private writeWarningDiagnostic(context: Record<string, number | string | undefined>) {
    writeDiagnosticOperationWarning({
      context: {
        ...this.getDiagnosticContext(),
        ...context,
      },
      feature: "folder-context",
      operation: "folderContextWatcher",
    });
  }

  private getDiagnosticContext() {
    return {
      folderPath: this.folderPath,
      ignoredDirectoryCount: this.ignoredDirectories.length,
      scopeGeneration: this.nativeWatchScope.generation,
      scopeId: this.nativeWatchScope.id,
    };
  }
}

const getWatchErrorDiagnosticContext = (error: WatchFolderContextError) => ({
  errorKind: error.kind,
  errorPath: "path" in error ? error.path : undefined,
});
