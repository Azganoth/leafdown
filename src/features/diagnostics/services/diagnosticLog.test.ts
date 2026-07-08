import { error as writeLogError } from "@tauri-apps/plugin-log";
import { describe, expect, it, vi } from "vitest";

import { handleUnexpectedError } from "@/lib/errors";

import {
  formatUnexpectedErrorDiagnostic,
  installUnexpectedErrorDiagnostics,
  writeUnexpectedErrorDiagnostic,
} from "./diagnosticLog";

describe("diagnostic log bridge", () => {
  it("formats unexpected frontend errors as one-line diagnostics", () => {
    const logMessage = formatUnexpectedErrorDiagnostic({
      componentStack: "DiagnosticComponent",
      contextLabel: "test: run",
      errorMessage: "failed",
      errorName: "Error",
      errorStack: "Error: failed\n    at test",
      message: "Unexpected error (test: run).",
    });

    expect(logMessage).toContain("[frontend]");
    expect(logMessage).toContain('"event":"frontendUnexpectedError"');
    expect(logMessage).toContain('"context":"test: run"');
    expect(logMessage).toContain('"componentStack":"DiagnosticComponent"');
    expect(logMessage).toContain('"message":"failed"');
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

  it("registers unexpected error diagnostics with the shared error helper", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cleanup = installUnexpectedErrorDiagnostics();

    handleUnexpectedError(new Error("installed diagnostic"), "diagnostics.install");
    cleanup();

    expect(writeLogError).toHaveBeenCalledWith(
      expect.stringContaining('"context":"diagnostics.install"'),
    );
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
