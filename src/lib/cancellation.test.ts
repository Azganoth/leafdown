import { describe, expect, it, vi } from "vitest";

import {
  CancellationError,
  CancellationToken,
  CancellationTokenSource,
  isCancellationError,
  raceWithCancellation,
  runWithCancellation,
  throwIfCancelled,
} from "./cancellation";

describe("cancellation", () => {
  it("starts token sources uncancelled", () => {
    const source = new CancellationTokenSource();

    expect(source.token.isCancellationRequested).toBe(false);
  });

  it("notifies registered listeners when cancelled", () => {
    const source = new CancellationTokenSource();
    const listener = vi.fn();

    source.token.onCancellationRequested(listener);
    source.cancel();

    expect(source.token.isCancellationRequested).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("does not notify disposed listeners", () => {
    const source = new CancellationTokenSource();
    const listener = vi.fn();
    const listenerDisposable = source.token.onCancellationRequested(listener);

    listenerDisposable.dispose();
    source.cancel();

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies listeners registered after cancellation immediately", () => {
    const source = new CancellationTokenSource();
    const listener = vi.fn();

    source.cancel();
    source.token.onCancellationRequested(listener);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("treats dispose as cancellation for scoped sources", () => {
    const source = new CancellationTokenSource();

    source.dispose();

    expect(source.token.isCancellationRequested).toBe(true);
  });

  it("throws and identifies cancellation errors", () => {
    expect(() => throwIfCancelled(CancellationToken.Cancelled)).toThrow(CancellationError);

    try {
      throwIfCancelled(CancellationToken.Cancelled);
    } catch (error) {
      expect(isCancellationError(error)).toBe(true);
    }
  });

  it("does not throw for uncancelled tokens", () => {
    expect(() => throwIfCancelled(CancellationToken.None)).not.toThrow();
  });

  it("runs raced cancellable tasks immediately while uncancelled", async () => {
    const events: string[] = [];
    const result = raceWithCancellation(CancellationToken.None, () => {
      events.push("task:start");
      return "done";
    });

    expect(events).toEqual(["task:start"]);
    await expect(result).resolves.toBe("done");
  });

  it("does not start raced cancellable tasks when already cancelled", async () => {
    const task = vi.fn(() => Promise.resolve("ignored"));

    await expect(raceWithCancellation(CancellationToken.Cancelled, task)).rejects.toThrow(
      CancellationError,
    );
    expect(task).not.toHaveBeenCalled();
  });

  it("rejects raced cancellable tasks as soon as cancellation is requested", async () => {
    const source = new CancellationTokenSource();
    const task = Promise.withResolvers<string>();
    const result = raceWithCancellation(source.token, () => task.promise);

    source.cancel();

    await expect(result).rejects.toThrow(CancellationError);

    task.resolve("late");
  });

  it("preserves raced cancellable task errors while uncancelled", async () => {
    const error = new Error("task failed");

    await expect(
      raceWithCancellation(CancellationToken.None, () => Promise.reject(error)),
    ).rejects.toBe(error);
  });

  it("runs cancellable tasks while uncancelled", async () => {
    await expect(
      runWithCancellation(CancellationToken.None, () => Promise.resolve("done")),
    ).resolves.toBe("done");
  });

  it("does not start cancellable tasks when already cancelled", async () => {
    const task = vi.fn(() => Promise.resolve("ignored"));

    await expect(runWithCancellation(CancellationToken.Cancelled, task)).rejects.toThrow(
      CancellationError,
    );
    expect(task).not.toHaveBeenCalled();
  });

  it("rejects completed cancellable task results after cancellation", async () => {
    const source = new CancellationTokenSource();
    const task = Promise.withResolvers<string>();
    const result = runWithCancellation(source.token, () => task.promise);

    source.cancel();
    task.resolve("stale");

    await expect(result).rejects.toThrow(CancellationError);
  });

  it("treats failed cancellable tasks as cancellation after cancellation", async () => {
    const source = new CancellationTokenSource();
    const task = Promise.withResolvers<string>();
    const result = runWithCancellation(source.token, () => task.promise);

    source.cancel();
    task.reject(new Error("stale failure"));

    await expect(result).rejects.toThrow(CancellationError);
  });

  it("preserves failed cancellable task errors while uncancelled", async () => {
    const error = new Error("task failed");

    await expect(
      runWithCancellation(CancellationToken.None, () => Promise.reject(error)),
    ).rejects.toBe(error);
  });
});
