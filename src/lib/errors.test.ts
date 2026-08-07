import { describe, expect, it, vi } from "vitest";

import { toastManager } from "@/lib/toast";

import { CancellationError } from "./cancellation";
import {
  addUnexpectedErrorReporter,
  handleUnexpectedError,
  installUnexpectedErrorHandlers,
  invariant,
  notifyOperationFailure,
  toError,
  UnknownThrownError,
} from "./errors";

describe("error helpers", () => {
  it("keeps Error values unchanged", () => {
    const error = new Error("failed");

    expect(toError(error)).toBe(error);
  });

  it("wraps non-Error thrown values", () => {
    const error = toError("failed");

    expect(error).toBeInstanceOf(UnknownThrownError);
    expect(error).toMatchObject({
      message: "failed",
      name: "UnknownThrownError",
    });
  });

  it("logs unexpected errors with context", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("failed");

    handleUnexpectedError(error, { source: "test", operation: "run" });

    expect(consoleError).toHaveBeenCalledWith("Unexpected error (test: run).", error);
  });

  it("logs component stack details when provided", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("stack failed");

    handleUnexpectedError(error, {
      componentStack: "StackComponent",
      source: "react",
      operation: "render",
    });

    expect(consoleError).toHaveBeenCalledWith("Unexpected error (react: render).", error, {
      componentStack: "StackComponent",
    });
  });

  it("reports unexpected errors to registered diagnostics reporters", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reporter = vi.fn();
    const cleanup = addUnexpectedErrorReporter(reporter);
    const error = new Error("reported diagnostic");

    handleUnexpectedError(error, {
      componentStack: "DiagnosticComponent",
      source: "test",
      operation: "report",
    });
    cleanup();

    expect(reporter).toHaveBeenCalledWith({
      componentStack: "DiagnosticComponent",
      contextLabel: "test: report",
      errorMessage: "reported diagnostic",
      errorName: "Error",
      errorStack: error.stack,
      message: "Unexpected error (test: report).",
    });
    expect(consoleError).toHaveBeenCalledWith("Unexpected error (test: report).", error, {
      componentStack: "DiagnosticComponent",
    });
  });

  it("does not let diagnostics reporter failures recurse through error handling", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cleanupAsyncReporter = addUnexpectedErrorReporter(() =>
      Promise.reject(new Error("report failed")),
    );
    const cleanupSyncReporter = addUnexpectedErrorReporter(() => {
      throw new Error("report failed");
    });

    handleUnexpectedError(new Error("reporter rejection"), "reporter-test");
    await Promise.resolve();
    cleanupAsyncReporter();
    cleanupSyncReporter();

    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("dedupes repeated unexpected errors within a short window", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    handleUnexpectedError(new Error("duplicate"), "dedupe-test");
    handleUnexpectedError(new Error("duplicate"), "dedupe-test");

    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("ignores cancellation errors", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    handleUnexpectedError(new CancellationError(), "test");
    notifyOperationFailure("Could not run task.", new CancellationError(), "test");

    expect(consoleError).not.toHaveBeenCalled();
    expect(toastManager.add).not.toHaveBeenCalled();
  });

  it("shows and logs operation failures", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("failed");

    notifyOperationFailure("Could not run task.", error, "test");

    expect(toastManager.add).toHaveBeenCalledWith({
      description: "failed",
      title: "Could not run task.",
      type: "error",
    });
    expect(consoleError).toHaveBeenCalledWith("Unexpected error (test).", error);
  });

  it("routes global error events through the unexpected error handler", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const target = new EventTarget() as Window;
    const cleanup = installUnexpectedErrorHandlers(target);
    const error = new Error("failed");
    const event = new Event("error", { cancelable: true }) as ErrorEvent;

    Object.defineProperties(event, {
      error: { value: error },
      message: { value: "failed" },
    });
    target.dispatchEvent(event);
    cleanup();

    expect(event.defaultPrevented).toBe(true);
    expect(consoleError).toHaveBeenCalledWith("Unexpected error (window.error).", error);
  });

  it("does not install duplicate global handlers for the same target", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const target = new EventTarget() as Window;
    const cleanup = installUnexpectedErrorHandlers(target);
    const sameCleanup = installUnexpectedErrorHandlers(target);
    const event = new Event("error", { cancelable: true }) as ErrorEvent;

    Object.defineProperty(event, "message", { value: "idempotent handler" });
    target.dispatchEvent(event);
    cleanup();

    expect(sameCleanup).toBe(cleanup);
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("routes global unhandled rejections through the unexpected error handler", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const target = new EventTarget() as Window;
    const cleanup = installUnexpectedErrorHandlers(target);
    const event = new Event("unhandledrejection", {
      cancelable: true,
    }) as PromiseRejectionEvent;

    Object.defineProperty(event, "reason", { value: "failed" });
    target.dispatchEvent(event);
    cleanup();

    expect(event.defaultPrevented).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (window.unhandledrejection).",
      expect.any(UnknownThrownError),
    );
  });

  it("removes installed global handlers", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const target = new EventTarget() as Window;
    const cleanup = installUnexpectedErrorHandlers(target);
    const event = new Event("error") as ErrorEvent;

    Object.defineProperty(event, "message", { value: "failed" });
    cleanup();
    target.dispatchEvent(event);

    expect(consoleError).not.toHaveBeenCalled();
  });

  it("throws invariant errors", () => {
    expect(() => invariant(false, "failed")).toThrow("failed");
    expect(() => invariant(true, "failed")).not.toThrow();
  });
});
