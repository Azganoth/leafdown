import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import {
  writeDiagnosticOperationFailure,
  writeDiagnosticOperationLifecycle,
} from "@/features/diagnostics";
import {
  isWatchMarkdownDocumentError,
  MARKDOWN_DOCUMENT_CHANGED_EVENT,
  unwatchMarkdownDocument,
  watchMarkdownDocument,
  type MarkdownDocumentChangedEventPayload,
} from "@/features/document";
import { DebouncedTaskRunner } from "@/lib/async";
import { isCancellationError } from "@/lib/cancellation";
import { getErrorDescription, handleUnexpectedError } from "@/lib/errors";
import { MutableDisposable, type Disposable } from "@/lib/lifecycle";
import { isSamePath, PathMap, PathSet } from "@/lib/path";

import { checkDocumentFile } from "../services/externalChanges";
import { useSessionStore, type DocumentTab } from "../stores/session";

export const DOCUMENT_WATCH_CHECK_DELAY_MS = 150;
let nextDocumentWatcherScopeGeneration = 0;

type DocumentWatcherLifecyclePhase = "started" | "stopped";
type DocumentWatcherFailurePhase = "starting" | "stopping";

export const resetDocumentWatcherScopeGenerationForTests = () => {
  nextDocumentWatcherScopeGeneration = 0;
};

/** Watches each open saved document on its own, whether or not the folder context contains it. */
export const useDocumentWatchers = () => {
  useEffect(() => {
    const watchers = new DocumentWatchers();

    watchers.sync(useSessionStore.getState().tabs);
    const unsubscribe = useSessionStore.subscribe((state, previous) => {
      if (state.tabs !== previous.tabs) {
        watchers.sync(state.tabs);
      }
    });

    return () => {
      unsubscribe();
      watchers.dispose();
    };
  }, []);
};

class DocumentWatchers implements Disposable {
  private readonly sessions = new PathMap<DocumentWatchSession>();
  private readonly paths = new PathSet();

  sync(tabs: readonly DocumentTab[]) {
    const nextPaths = new PathSet(
      tabs.flatMap(({ document }) => (document.status === "saved" ? [document.path] : [])),
    );

    for (const path of this.paths) {
      if (!nextPaths.has(path)) {
        this.sessions.get(path)?.dispose();
        this.sessions.delete(path);
        this.paths.delete(path);
      }
    }

    for (const path of nextPaths) {
      if (!this.paths.has(path)) {
        const session = new DocumentWatchSession(path);

        this.sessions.set(path, session);
        this.paths.add(path);
        session.start();
      }
    }
  }

  dispose() {
    for (const path of this.paths) {
      this.sessions.get(path)?.dispose();
    }

    this.sessions.clear();
    this.paths.clear();
  }
}

const createDocumentWatcherScopeId = () => {
  nextDocumentWatcherScopeGeneration += 1;

  return `document-watch:${nextDocumentWatcherScopeGeneration}`;
};

class DocumentWatchSession {
  private readonly appWindow = getCurrentWindow();
  private readonly nativeWatchScopeId = createDocumentWatcherScopeId();
  private readonly checkRunner = new DebouncedTaskRunner(
    (cancellationToken) => checkDocumentFile(this.documentPath, cancellationToken),
    DOCUMENT_WATCH_CHECK_DELAY_MS,
  );
  private readonly changedListener = new MutableDisposable<() => void>();
  private isDisposed = false;
  private isNativeWatchRequested = false;
  private isNativeWatcherStarted = false;

  constructor(private readonly documentPath: string) {}

  // The file may have changed between reading it and watching it, so the first check runs once
  // the watch is in place, or once starting it has failed.
  start() {
    void this.listenAndStartWatcher()
      .catch((error) => {
        this.reportStartFailure(error);
      })
      .finally(() => {
        this.requestCheck();
      });
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.checkRunner.dispose();
    this.changedListener.dispose();

    // The backend keeps a stop that arrives before its start until that start arrives.
    if (!this.isNativeWatchRequested) {
      return;
    }

    const wasNativeWatcherStarted = this.isNativeWatcherStarted;

    void unwatchMarkdownDocument({ scopeId: this.nativeWatchScopeId })
      .then(() => {
        if (wasNativeWatcherStarted) {
          this.writeLifecycleDiagnostic("stopped");
        }
      })
      .catch((error) => {
        this.writeFailureDiagnostic("stopping", {
          errorMessage: getErrorDescription(error),
          wasNativeWatcherStarted,
        });
        handleUnexpectedError(error, "unwatchMarkdownDocument");
      });
  }

  private requestCheck() {
    if (this.isDisposed) {
      return;
    }

    void this.checkRunner.run().catch((error) => {
      if (!isCancellationError(error)) {
        handleUnexpectedError(error, "checkDocumentFile");
      }
    });
  }

  private async listenAndStartWatcher() {
    this.changedListener.value = await this.appWindow.listen<MarkdownDocumentChangedEventPayload>(
      MARKDOWN_DOCUMENT_CHANGED_EVENT,
      (event) => {
        if (isSamePath(event.payload.path, this.documentPath)) {
          this.requestCheck();
        }
      },
    );

    if (this.isDisposed) {
      return;
    }

    this.isNativeWatchRequested = true;
    await watchMarkdownDocument({ path: this.documentPath, scopeId: this.nativeWatchScopeId });

    if (!this.isDisposed) {
      this.isNativeWatcherStarted = true;
      this.writeLifecycleDiagnostic("started");
    }
  }

  // Without the watch, Save still verifies the file before writing, so a failure is logged rather
  // than interrupting the user.
  private reportStartFailure(error: unknown) {
    if (this.isDisposed) {
      return;
    }

    if (!isWatchMarkdownDocumentError(error)) {
      handleUnexpectedError(error, "startDocumentWatcher");
      return;
    }

    this.writeFailureDiagnostic("starting", {
      errorKind: error.kind,
      errorMessage: "message" in error ? error.message : undefined,
    });
  }

  private writeLifecycleDiagnostic(phase: DocumentWatcherLifecyclePhase) {
    void writeDiagnosticOperationLifecycle({
      context: this.getDiagnosticContext(),
      feature: "document",
      operation: "documentWatcher",
      phase,
    });
  }

  private writeFailureDiagnostic(
    phase: DocumentWatcherFailurePhase,
    context: Record<string, unknown>,
  ) {
    void writeDiagnosticOperationFailure({
      context: {
        ...this.getDiagnosticContext(),
        ...context,
        phase,
      },
      feature: "document",
      operation: "documentWatcher",
    });
  }

  private getDiagnosticContext() {
    return {
      documentPath: this.documentPath,
      scopeId: this.nativeWatchScopeId,
    };
  }
}
