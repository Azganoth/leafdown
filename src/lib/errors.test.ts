import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { CancellationError } from "./cancellation";
import {
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
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows and logs operation failures", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("failed");

    notifyOperationFailure("Could not run task.", error, "test");

    expect(toast.error).toHaveBeenCalledWith("Could not run task.", {
      description: "failed",
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
