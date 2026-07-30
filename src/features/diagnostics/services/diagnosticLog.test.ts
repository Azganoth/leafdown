import {
  error as writeLogError,
  info as writeLogInfo,
  warn as writeLogWarn,
} from "@tauri-apps/plugin-log";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleUnexpectedError } from "@/lib/errors";
import {
  getDiagnosticPayloadAt,
  getLastDiagnosticMessage,
  getLastDiagnosticPayload,
  pollForDiagnosticMessage,
} from "@/test/utils/diagnostics";

import {
  installUnexpectedErrorDiagnostics,
  SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
  writeDiagnosticError,
  writeDiagnosticInfo,
  writeDiagnosticOperationFailure,
  writeDiagnosticOperationLifecycle,
  writeDiagnosticOperationWarning,
  writeDiagnosticSlowOperation,
  writeDiagnosticUnexpectedError,
  writeDiagnosticWarn,
} from "./diagnosticLog";

describe("diagnostic log bridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes unexpected frontend errors to the Tauri log plugin", async () => {
    await writeDiagnosticUnexpectedError({
      componentStack: "DiagnosticComponent",
      contextLabel: "test: run",
      errorMessage: "failed",
      errorName: "Error",
      errorStack: "Error: failed\n    at test",
      message: "Unexpected error (test: run).",
    });
    const logMessage = getLastDiagnosticMessage("error");
    const payload = JSON.parse(logMessage) as {
      componentStack: string;
      context: string;
      error: { message: string; stack: string };
      event: string;
      message: string;
    };

    expect(payload.event).toBe("frontendUnexpectedError");
    expect(payload.context).toBe("test: run");
    expect(payload.componentStack).toBe("DiagnosticComponent");
    expect(payload.error.message).toBe("failed");
    expect(payload.error.stack).toContain("Error: failed");
    expect(payload).not.toHaveProperty("runId");
    expect(logMessage).not.toContain("\n");
  });

  it("normalizes structured diagnostic events as one-line payloads", async () => {
    await writeDiagnosticWarn({
      event: "operationFailed",
      feature: "document",
      nested: {
        omitted: undefined,
        unsupported: () => undefined,
        value: "kept",
      },
    });
    const message = getLastDiagnosticMessage("warn");
    const payload = JSON.parse(message) as {
      event: string;
      feature: string;
      nested: { omitted?: string; unsupported?: string; value: string };
    };

    expect(message).not.toContain("\n");
    expect(payload).toEqual({
      event: "operationFailed",
      feature: "document",
      nested: { value: "kept" },
    });
  });

  it("writes structured diagnostics at info, warn, and error levels", async () => {
    await writeDiagnosticInfo({ event: "diagnosticInfo", feature: "diagnostics" });
    await writeDiagnosticWarn({ event: "operationFailed", feature: "document" });
    await writeDiagnosticError({ event: "frontendUnexpectedError", feature: "diagnostics" });

    expect(writeLogInfo).toHaveBeenCalledWith(expect.stringContaining('"event":"diagnosticInfo"'));
    expect(writeLogWarn).toHaveBeenCalledWith(expect.stringContaining('"event":"operationFailed"'));
    expect(writeLogError).toHaveBeenCalledWith(
      expect.stringContaining('"event":"frontendUnexpectedError"'),
    );
  });

  it("writes standardized operation diagnostics", async () => {
    await writeDiagnosticOperationFailure({
      context: { errorKind: "missingFile", path: "notes/missing.md" },
      feature: "document",
      operation: "openMarkdownDocument",
    });
    await writeDiagnosticOperationWarning({
      context: { warningKind: "scanWarnings", warningCount: 1 },
      feature: "folder-context",
      operation: "scanFolderContext",
    });
    await writeDiagnosticOperationLifecycle({
      context: { scopeId: "folder-watch:1" },
      feature: "folder-context",
      operation: "folderContextWatcher",
      phase: "started",
    });

    expect(getDiagnosticPayloadAt("warn", -2)).toMatchObject({
      errorKind: "missingFile",
      event: "operationFailed",
      feature: "document",
      operation: "openMarkdownDocument",
      path: "notes/missing.md",
    });
    expect(getLastDiagnosticPayload("warn")).toMatchObject({
      event: "operationWarning",
      feature: "folder-context",
      operation: "scanFolderContext",
      warningCount: 1,
      warningKind: "scanWarnings",
    });
    expect(getLastDiagnosticPayload("info")).toMatchObject({
      event: "operationLifecycle",
      feature: "folder-context",
      operation: "folderContextWatcher",
      phase: "started",
      scopeId: "folder-watch:1",
    });
  });

  it("writes slow operation diagnostics when the threshold is reached", () => {
    const performanceNow = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS + 25);

    try {
      expect(
        writeDiagnosticSlowOperation({
          context: { outcome: "succeeded", path: "notes/article.md" },
          feature: "document",
          operation: "openMarkdownDocument",
          startedAtMs: 0,
        }),
      ).toBe(true);
    } finally {
      performanceNow.mockRestore();
    }

    expect(writeLogInfo).toHaveBeenCalledWith(expect.stringContaining('"event":"operationTiming"'));
    expect(getLastDiagnosticPayload("info")).toMatchObject({
      durationMs: SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS + 25,
      event: "operationTiming",
      feature: "document",
      operation: "openMarkdownDocument",
      outcome: "succeeded",
      path: "notes/article.md",
      thresholdMs: SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
    });
  });

  it("skips slow operation diagnostics below the threshold", () => {
    const performanceNow = vi
      .spyOn(performance, "now")
      .mockReturnValueOnce(SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS - 1);

    try {
      expect(
        writeDiagnosticSlowOperation({
          feature: "document",
          operation: "openMarkdownDocument",
          startedAtMs: 0,
        }),
      ).toBe(false);
    } finally {
      performanceNow.mockRestore();
    }

    expect(writeLogInfo).not.toHaveBeenCalled();
  });

  it("registers unexpected error diagnostics with the shared error helper", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cleanup = installUnexpectedErrorDiagnostics();
    await Promise.resolve();

    handleUnexpectedError(new Error("installed diagnostic"), "diagnostics.install");
    cleanup();

    await pollForDiagnosticMessage("error", '"event":"frontendUnexpectedError"');
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
