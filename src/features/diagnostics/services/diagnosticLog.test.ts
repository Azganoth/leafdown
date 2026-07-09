import {
  error as writeLogError,
  info as writeLogInfo,
  warn as writeLogWarn,
} from "@tauri-apps/plugin-log";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleUnexpectedError } from "@/lib/errors";

import {
  formatDiagnosticEvent,
  formatUnexpectedErrorDiagnostic,
  installUnexpectedErrorDiagnostics,
  writeDiagnosticInfo,
  writeDiagnosticWarn,
  writeUnexpectedErrorDiagnostic,
} from "./diagnosticLog";

describe("diagnostic log bridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("formats unexpected frontend errors as one-line diagnostics", () => {
    const logMessage = formatUnexpectedErrorDiagnostic({
      componentStack: "DiagnosticComponent",
      contextLabel: "test: run",
      errorMessage: "failed",
      errorName: "Error",
      errorStack: "Error: failed\n    at test",
      message: "Unexpected error (test: run).",
    });
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
    expect(writeLogError).not.toHaveBeenCalledWith(expect.stringContaining('"runId"'));
  });

  it("formats structured diagnostic events as one-line payloads", () => {
    const message = formatDiagnosticEvent({
      event: "operationFailed",
      feature: "document",
      nested: {
        omitted: undefined,
        value: "kept",
      },
    });
    const payload = JSON.parse(message) as {
      event: string;
      feature: string;
      nested: { omitted?: string; value: string };
    };

    expect(message).not.toContain("\n");
    expect(payload).toEqual({
      event: "operationFailed",
      feature: "document",
      nested: { value: "kept" },
    });
  });

  it("writes structured diagnostics at info and warn levels", async () => {
    await writeDiagnosticInfo({ event: "appClosing" });
    await writeDiagnosticWarn({ event: "operationFailed", feature: "document" });

    expect(writeLogInfo).toHaveBeenCalledWith(expect.stringContaining('"event":"appClosing"'));
    expect(writeLogWarn).toHaveBeenCalledWith(expect.stringContaining('"event":"operationFailed"'));
  });

  it("registers unexpected error diagnostics with the shared error helper", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cleanup = installUnexpectedErrorDiagnostics();
    await Promise.resolve();

    handleUnexpectedError(new Error("installed diagnostic"), "diagnostics.install");
    cleanup();

    await expect
      .poll(() => vi.mocked(writeLogError).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"event":"frontendUnexpectedError"');
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
