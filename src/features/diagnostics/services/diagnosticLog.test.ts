import {
  error as writeLogError,
  info as writeLogInfo,
  warn as writeLogWarn,
} from "@tauri-apps/plugin-log";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleUnexpectedError } from "@/lib/errors";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import {
  formatDiagnosticEvent,
  formatUnexpectedErrorDiagnostic,
  installUnexpectedErrorDiagnostics,
  resetDiagnosticsRunIdForTests,
  writeDiagnosticInfo,
  writeDiagnosticWarn,
  writeUnexpectedErrorDiagnostic,
} from "./diagnosticLog";

describe("diagnostic log bridge", () => {
  beforeEach(() => {
    resetDiagnosticsRunIdForTests();
    mockTauriApiCommand("getDiagnosticsRuntime", () => ({ runId: "run-test" }));
  });

  it("formats unexpected frontend errors as one-line diagnostics", () => {
    const logMessage = formatUnexpectedErrorDiagnostic(
      {
        componentStack: "DiagnosticComponent",
        contextLabel: "test: run",
        errorMessage: "failed",
        errorName: "Error",
        errorStack: "Error: failed\n    at test",
        message: "Unexpected error (test: run).",
      },
      { runId: "run-test" },
    );
    const payload = JSON.parse(logMessage) as {
      componentStack: string;
      context: string;
      error: { message: string; stack: string };
      event: string;
      message: string;
      runId: string;
    };

    expect(payload.event).toBe("frontendUnexpectedError");
    expect(payload.context).toBe("test: run");
    expect(payload.componentStack).toBe("DiagnosticComponent");
    expect(payload.error.message).toBe("failed");
    expect(payload.error.stack).toContain("Error: failed");
    expect(payload.runId).toBe("run-test");
  });

  it("writes unexpected frontend errors to the Tauri log plugin", async () => {
    await writeUnexpectedErrorDiagnostic({
      contextLabel: "diagnostics.test",
      errorMessage: "write failed",
      errorName: "Error",
      message: "Unexpected error (diagnostics.test).",
    });

    expect(writeLogError).toHaveBeenCalledWith(
      expect.stringContaining('"event":"frontendUnexpectedError"'),
    );
    expect(writeLogError).toHaveBeenCalledWith(expect.stringContaining('"runId":"run-test"'));
  });

  it("formats structured diagnostic events as one-line payloads", () => {
    const message = formatDiagnosticEvent(
      {
        event: "operationFailed",
        feature: "document",
        nested: {
          omitted: undefined,
          value: "kept",
        },
      },
      { runId: "run-test" },
    );
    const payload = JSON.parse(message) as {
      event: string;
      feature: string;
      nested: { omitted?: string; value: string };
      runId: string;
    };

    expect(message).not.toContain("\n");
    expect(payload).toEqual({
      event: "operationFailed",
      feature: "document",
      nested: { value: "kept" },
      runId: "run-test",
    });
  });

  it("writes structured diagnostics at info and warn levels", async () => {
    await writeDiagnosticInfo({ event: "appClosing" });
    await writeDiagnosticWarn({ event: "operationFailed", feature: "document" });

    expect(writeLogInfo).toHaveBeenCalledWith(expect.stringContaining('"event":"appClosing"'));
    expect(writeLogWarn).toHaveBeenCalledWith(expect.stringContaining('"event":"operationFailed"'));
  });

  it("retries diagnostic run id lookup after a transient failure", async () => {
    let attempts = 0;
    mockTauriApiCommand("getDiagnosticsRuntime", () => {
      attempts += 1;

      if (attempts === 1) {
        return Promise.reject(new Error("runtime unavailable"));
      }

      return { runId: "run-recovered" };
    });

    await writeDiagnosticInfo({ event: "firstDiagnostic" });

    expect(vi.mocked(writeLogInfo).mock.calls.at(-1)?.[0]).not.toContain("runId");

    await writeDiagnosticInfo({ event: "secondDiagnostic" });

    expect(attempts).toBe(2);
    expect(writeLogInfo).toHaveBeenCalledWith(expect.stringContaining('"runId":"run-recovered"'));
  });

  it("registers unexpected error diagnostics with the shared error helper", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cleanup = installUnexpectedErrorDiagnostics();
    await Promise.resolve();

    handleUnexpectedError(new Error("installed diagnostic"), "diagnostics.install");
    cleanup();

    await expect
      .poll(() => vi.mocked(writeLogError).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"runId":"run-test"');
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
