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
import { MutableDisposable } from "@/lib/lifecycle";
import { isSamePath } from "@/lib/path";

import { checkActiveDocumentFile } from "../services/externalChanges";
import { useSessionStore } from "../stores/session";

export const DOCUMENT_WATCH_CHECK_DELAY_MS = 150;
let nextDocumentWatcherScopeGeneration = 0;

type DocumentWatcherLifecyclePhase = "started" | "stopped";
type DocumentWatcherFailurePhase = "starting" | "stopping";

export const resetDocumentWatcherScopeGenerationForTests = () => {
  nextDocumentWatcherScopeGeneration = 0;
};

/** Watches the active saved document on its own, whether or not the folder context contains it. */
export const useActiveDocumentWatcher = () => {
  const documentPath = useSessionStore((state) =>
    state.activeDocument?.status === "saved" ? state.activeDocument.path : null,
  );

  useEffect(() => {
    if (!documentPath) {
      return;
    }

    const session = new ActiveDocumentWatchSession(documentPath);
    session.start();

    return () => {
      session.dispose();
    };
  }, [documentPath]);
};

const createDocumentWatcherScopeId = () => {
  nextDocumentWatcherScopeGeneration += 1;

  return `document-watch:${nextDocumentWatcherScopeGeneration}`;
};

class ActiveDocumentWatchSession {
  private readonly appWindow = getCurrentWindow();
  private readonly nativeWatchScopeId = createDocumentWatcherScopeId();
  private readonly checkRunner = new DebouncedTaskRunner(
    checkActiveDocumentFile,
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
        handleUnexpectedError(error, "checkActiveDocumentFile");
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
