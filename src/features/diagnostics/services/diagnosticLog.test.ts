import { error as writeLogError } from "@tauri-apps/plugin-log";
import { describe, expect, it, vi } from "vitest";

import { handleUnexpectedError } from "@/lib/errors";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import {
  formatUnexpectedErrorDiagnostic,
  installUnexpectedErrorDiagnostics,
  writeUnexpectedErrorDiagnostic,
} from "./diagnosticLog";

describe("diagnostic log bridge", () => {
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
  });

  it("registers unexpected error diagnostics with the shared error helper", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockTauriApiCommand("getDiagnosticsRuntime", () => ({ runId: "run-test" }));
    const cleanup = installUnexpectedErrorDiagnostics();
    await Promise.resolve();

    handleUnexpectedError(new Error("installed diagnostic"), "diagnostics.install");
    cleanup();

    expect(writeLogError).toHaveBeenCalledWith(expect.stringContaining('"runId":"run-test"'));
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
