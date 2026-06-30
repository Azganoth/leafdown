import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AsyncLazy,
  DebouncedTaskRunner,
  RestartableTaskRunner,
  SequentialTaskQueue,
  TaskLimiter,
} from "./async";
import { CancellationError, type CancellationToken, CancellationTokenSource } from "./cancellation";

const SCHEDULE_DELAY_MS = 25;

const advanceScheduleTimer = async () => {
  await vi.advanceTimersByTimeAsync(SCHEDULE_DELAY_MS);
};

describe("AsyncLazy", () => {
  it("does not run before the value is requested", () => {
    const task = vi.fn(() => "ready");

    new AsyncLazy(task);

    expect(task).not.toHaveBeenCalled();
  });

  it("runs the task once and shares the value promise", async () => {
    const task = vi.fn(() => Promise.resolve("ready"));
    const lazy = new AsyncLazy(task);

    const firstValue = lazy.value;
    const secondValue = lazy.value;

    expect(firstValue).toBe(secondValue);
    await expect(firstValue).resolves.toBe("ready");
    expect(task).toHaveBeenCalledOnce();
  });

  it("converts synchronous failures into a cached rejection", async () => {
    const error = new Error("load failed");
    const task = vi.fn(() => {
      throw error;
    });
    const lazy = new AsyncLazy(task);

    const firstValue = lazy.value;
    const secondValue = lazy.value;

    await expect(firstValue).rejects.toBe(error);
    await expect(secondValue).rejects.toBe(error);
    expect(task).toHaveBeenCalledOnce();
  });

  it("caches rejected values by default", async () => {
    const error = new Error("load failed");
    const task = vi.fn(() => Promise.reject(error));
    const lazy = new AsyncLazy(task);

    await expect(lazy.value).rejects.toBe(error);
    await expect(lazy.value).rejects.toBe(error);

    expect(task).toHaveBeenCalledOnce();
  });

  it("reruns after failures when retry-on-failure is enabled", async () => {
    const error = new Error("load failed");
    const task = vi.fn(() =>
      task.mock.calls.length === 1 ? Promise.reject(error) : Promise.resolve("ready"),
    );
    const lazy = new AsyncLazy(task, { retryOnFailure: true });

    await expect(lazy.value).rejects.toBe(error);
    await expect(lazy.value).resolves.toBe("ready");

    expect(task).toHaveBeenCalledTimes(2);
  });
});

describe("TaskLimiter", () => {
  it("rejects invalid concurrency limits", () => {
    expect(() => new TaskLimiter(0)).toThrow(RangeError);
    expect(() => new TaskLimiter(1.5)).toThrow(RangeError);
  });

  it("runs tasks up to the configured concurrency and queues the rest", async () => {
    const limiter = new TaskLimiter(2);
    const firstTask = Promise.withResolvers<string>();
    const secondTask = Promise.withResolvers<string>();
    const events: string[] = [];

    const firstRun = limiter.run(() => {
      events.push("first:start");
      return firstTask.promise;
    });
    const secondRun = limiter.run(() => {
      events.push("second:start");
      return secondTask.promise;
    });
    const thirdRun = limiter.run(() => {
      events.push("third:start");
      return "third";
    });

    expect(events).toEqual(["first:start", "second:start"]);
    expect(limiter.activeCount).toBe(2);
    expect(limiter.pendingCount).toBe(1);

    firstTask.resolve("first");

    await expect(firstRun).resolves.toBe("first");
    await expect(thirdRun).resolves.toBe("third");
    expect(events).toEqual(["first:start", "second:start", "third:start"]);
    expect(limiter.activeCount).toBe(1);
    expect(limiter.pendingCount).toBe(0);

    secondTask.resolve("second");

    await expect(secondRun).resolves.toBe("second");
    expect(limiter.activeCount).toBe(0);
  });

  it("continues after task failures", async () => {
    const limiter = new TaskLimiter(1);
    const error = new Error("Task failed.");
    const events: string[] = [];

    const firstRun = limiter.run(() => {
      events.push("first:start");
      throw error;
    });
    const secondRun = limiter.run(() => {
      events.push("second:start");
      return "second";
    });

    await expect(firstRun).rejects.toBe(error);
    await expect(secondRun).resolves.toBe("second");
    expect(events).toEqual(["first:start", "second:start"]);
    expect(limiter.activeCount).toBe(0);
    expect(limiter.pendingCount).toBe(0);
  });

  it("cancels queued tasks before they start", async () => {
    const limiter = new TaskLimiter(1);
    const firstTask = Promise.withResolvers<string>();
    const queuedCancellation = new CancellationTokenSource();
    const queuedTask = vi.fn(() => "queued");

    const firstRun = limiter.run(() => firstTask.promise);
    const queuedRun = limiter.run(queuedTask, queuedCancellation.token);

    expect(limiter.activeCount).toBe(1);
    expect(limiter.pendingCount).toBe(1);

    queuedCancellation.cancel();

    await expect(queuedRun).rejects.toThrow(CancellationError);
    expect(queuedTask).not.toHaveBeenCalled();
    expect(limiter.pendingCount).toBe(0);

    firstTask.resolve("first");

    await expect(firstRun).resolves.toBe("first");
    expect(limiter.activeCount).toBe(0);
  });

  it("leaves already started tasks responsible for their own cancellation", async () => {
    const limiter = new TaskLimiter(1);
    const runningTask = Promise.withResolvers<string>();
    const runningCancellation = new CancellationTokenSource();
    const run = limiter.run(() => runningTask.promise, runningCancellation.token);

    runningCancellation.cancel();
    runningTask.resolve("done");

    await expect(run).resolves.toBe("done");
  });
});

describe("SequentialTaskQueue", () => {
  it("runs queued tasks in sequence", async () => {
    const queue = new SequentialTaskQueue();
    const firstTask = Promise.withResolvers<string>();
    const events: string[] = [];

    const firstRun = queue.run(async () => {
      events.push("first:start");
      return firstTask.promise;
    });
    const secondRun = queue.run(() => {
      events.push("second:start");
      return "second";
    });

    expect(events).toEqual(["first:start"]);

    firstTask.resolve("first");

    await expect(firstRun).resolves.toBe("first");
    await expect(secondRun).resolves.toBe("second");
    expect(events).toEqual(["first:start", "second:start"]);
  });

  it("continues after queued task failures", async () => {
    const queue = new SequentialTaskQueue();
    const error = new Error("Task failed.");
    const events: string[] = [];

    const firstRun = queue.run(() => {
      events.push("first:start");
      throw error;
    });
    const secondRun = queue.run(() => {
      events.push("second:start");
      return "second";
    });

    await expect(firstRun).rejects.toBe(error);
    await expect(secondRun).resolves.toBe("second");
    expect(events).toEqual(["first:start", "second:start"]);
  });
});

describe("RestartableTaskRunner", () => {
  it("runs tasks with an uncancelled token", async () => {
    const runner = new RestartableTaskRunner();

    await expect(
      runner.run(async (cancellationToken) => {
        expect(cancellationToken.isCancellationRequested).toBe(false);
        return "done";
      }),
    ).resolves.toBe("done");
  });

  it("cancels the previous task when a newer task starts", async () => {
    const runner = new RestartableTaskRunner();
    const firstTask = Promise.withResolvers<string>();
    const secondTask = Promise.withResolvers<string>();
    const firstPromise = runner.run((cancellationToken) => {
      expect(cancellationToken.isCancellationRequested).toBe(false);
      return firstTask.promise;
    });

    const secondPromise = runner.run((cancellationToken) => {
      expect(cancellationToken.isCancellationRequested).toBe(false);
      return secondTask.promise;
    });

    firstTask.resolve("first");
    secondTask.resolve("second");

    await expect(firstPromise).resolves.toBe("first");
    await expect(secondPromise).resolves.toBe("second");
  });

  it("notifies previous task listeners when a newer task starts", async () => {
    const runner = new RestartableTaskRunner();
    const listener = vi.fn();
    const firstTask = Promise.withResolvers<void>();

    const firstRun = runner.run((cancellationToken) => {
      cancellationToken.onCancellationRequested(listener);
      return firstTask.promise;
    });
    void runner.run(async () => {});

    expect(listener).toHaveBeenCalledOnce();
    firstTask.resolve();
    await firstRun;
  });

  it("cancels the active task on disposal", async () => {
    const runner = new RestartableTaskRunner();
    const listener = vi.fn();

    const run = runner.run(
      (cancellationToken) =>
        new Promise<void>((resolve) => {
          cancellationToken.onCancellationRequested(() => {
            listener();
            resolve();
          });
        }),
    );

    runner.dispose();

    expect(listener).toHaveBeenCalledOnce();
    await run;
  });
});

describe("DebouncedTaskRunner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces calls and resolves each caller with the task result", async () => {
    const task = vi.fn(() => "done");
    const runner = new DebouncedTaskRunner(task, SCHEDULE_DELAY_MS);

    const firstRun = runner.run();

    await vi.advanceTimersByTimeAsync(SCHEDULE_DELAY_MS - 5);

    const secondRun = runner.run();

    expect(secondRun).toBe(firstRun);

    await vi.advanceTimersByTimeAsync(SCHEDULE_DELAY_MS - 5);

    expect(task).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5);

    await expect(firstRun).resolves.toBe("done");
    await expect(secondRun).resolves.toBe("done");
    expect(task).toHaveBeenCalledOnce();
  });

  it("rejects returned promises when the task fails", async () => {
    const error = new Error("Task failed.");
    const runner = new DebouncedTaskRunner(() => {
      throw error;
    }, SCHEDULE_DELAY_MS);

    const run = runner.run();
    const rejection = expect(run).rejects.toBe(error);

    await advanceScheduleTimer();

    await rejection;
  });

  it("queues a debounced follow-up run while a task is active", async () => {
    const firstTask = Promise.withResolvers<string>();
    const task = vi.fn(() => {
      if (task.mock.calls.length === 1) {
        return firstTask.promise;
      }

      return "second";
    });
    const runner = new DebouncedTaskRunner(task, SCHEDULE_DELAY_MS);

    const firstRun = runner.run();

    await advanceScheduleTimer();

    expect(task).toHaveBeenCalledOnce();

    const secondRun = runner.run();

    expect(secondRun).not.toBe(firstRun);

    firstTask.resolve("first");

    await expect(firstRun).resolves.toBe("first");
    expect(task).toHaveBeenCalledOnce();

    await advanceScheduleTimer();

    await expect(secondRun).resolves.toBe("second");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("cancels pending runs before they start", async () => {
    const task = vi.fn(() => "ignored");
    const runner = new DebouncedTaskRunner(task, SCHEDULE_DELAY_MS);
    const run = runner.run();
    const rejection = expect(run).rejects.toThrow(CancellationError);

    runner.cancel();
    await advanceScheduleTimer();

    await rejection;
    expect(task).not.toHaveBeenCalled();
  });

  it("rejects active runs and cancels their token on disposal", async () => {
    const observed: { cancellationToken: CancellationToken | null } = {
      cancellationToken: null,
    };
    const activeTask = Promise.withResolvers<string>();
    const runner = new DebouncedTaskRunner((token) => {
      observed.cancellationToken = token;
      return activeTask.promise;
    }, SCHEDULE_DELAY_MS);
    const run = runner.run();

    await advanceScheduleTimer();

    const rejection = expect(run).rejects.toThrow(CancellationError);

    runner.dispose();

    expect(observed.cancellationToken?.isCancellationRequested).toBe(true);
    await rejection;

    activeTask.resolve("late");
  });

  it("rejects new runs after disposal", async () => {
    const runner = new DebouncedTaskRunner(() => "ignored", SCHEDULE_DELAY_MS);

    runner.dispose();

    await expect(runner.run()).rejects.toThrow(CancellationError);
  });
});
