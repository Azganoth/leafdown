import { CancellationError, CancellationToken, CancellationTokenSource } from "./cancellation";
import { type Disposable, MutableDisposable } from "./lifecycle";
import { runTaskAsPromise } from "./task";

export interface AsyncLazyOptions {
  retryOnFailure?: boolean;
}

interface PendingLimitedTask {
  cancel: () => void;
  cancellationListener: Disposable | null;
  start: () => void;
}

interface DebouncedTaskRun<T> {
  cancellation: CancellationTokenSource;
  deferred: PromiseWithResolvers<T>;
}

const ignorePromiseResult = () => {};

export class AsyncLazy<T> {
  private valuePromise: Promise<T> | null = null;

  constructor(
    private readonly task: () => T | PromiseLike<T>,
    private readonly options: AsyncLazyOptions = {},
  ) {}

  get value() {
    if (!this.valuePromise) {
      const nextValuePromise = runTaskAsPromise(this.task);
      this.valuePromise = nextValuePromise;

      if (this.options.retryOnFailure) {
        void nextValuePromise.catch(() => {
          if (this.valuePromise === nextValuePromise) {
            this.valuePromise = null;
          }
        });
      }
    }

    return this.valuePromise;
  }
}

export class TaskLimiter {
  private activeTaskCount = 0;
  private readonly pendingTasks: PendingLimitedTask[] = [];

  constructor(private readonly maxConcurrentTasks: number) {
    if (!Number.isInteger(maxConcurrentTasks) || maxConcurrentTasks < 1) {
      throw new RangeError("TaskLimiter concurrency must be at least 1.");
    }
  }

  get activeCount() {
    return this.activeTaskCount;
  }

  get pendingCount() {
    return this.pendingTasks.length;
  }

  run<T>(
    task: () => T | PromiseLike<T>,
    cancellationToken: CancellationToken = CancellationToken.None,
  ) {
    if (cancellationToken.isCancellationRequested) {
      return Promise.reject(new CancellationError());
    }

    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const limitedTask: PendingLimitedTask = {
      cancel: () => {
        limitedTask.cancellationListener?.dispose();
        reject(new CancellationError());
      },
      cancellationListener: null,
      start: () => {
        limitedTask.cancellationListener?.dispose();
        void this.runLimitedTask(task, resolve, reject);
      },
    };

    if (this.activeTaskCount < this.maxConcurrentTasks) {
      limitedTask.start();
    } else {
      limitedTask.cancellationListener = cancellationToken.onCancellationRequested(() => {
        const taskIndex = this.pendingTasks.indexOf(limitedTask);

        if (taskIndex === -1) {
          return;
        }

        this.pendingTasks.splice(taskIndex, 1);
        limitedTask.cancel();
      });
      this.pendingTasks.push(limitedTask);
    }

    return promise;
  }

  private async runLimitedTask<T>(
    task: () => T | PromiseLike<T>,
    resolve: (value: T) => void,
    reject: (error: unknown) => void,
  ) {
    this.activeTaskCount += 1;

    try {
      const result = await runTaskAsPromise(task);
      this.finishTask();
      resolve(result);
    } catch (error) {
      this.finishTask();
      reject(error);
    }
  }

  private finishTask() {
    this.activeTaskCount -= 1;
    this.startPendingTasks();
  }

  private startPendingTasks() {
    while (this.activeTaskCount < this.maxConcurrentTasks) {
      const nextTask = this.pendingTasks.shift();

      if (!nextTask) {
        return;
      }

      nextTask.start();
    }
  }
}

export class SequentialTaskQueue {
  private tail: Promise<void> | null = null;

  run<T>(task: () => T | PromiseLike<T>) {
    const queuedTask = this.tail
      ? this.tail.then(() => runTaskAsPromise(task))
      : runTaskAsPromise(task);
    const nextTail = queuedTask.then(ignorePromiseResult, ignorePromiseResult);
    this.tail = nextTail;

    void nextTail.then(() => {
      if (this.tail === nextTail) {
        this.tail = null;
      }
    });

    return queuedTask;
  }
}

export class RestartableTaskRunner implements Disposable {
  private readonly currentTaskCancellation = new MutableDisposable<CancellationTokenSource>();

  async run<T>(task: (cancellationToken: CancellationToken) => Promise<T>) {
    const taskCancellation = this.createTaskCancellation();

    try {
      return await task(taskCancellation.token);
    } finally {
      if (this.currentTaskCancellation.value === taskCancellation) {
        this.currentTaskCancellation.clear();
      }
    }
  }

  cancel() {
    this.currentTaskCancellation.clear();
  }

  dispose() {
    this.cancel();
  }

  private createTaskCancellation() {
    this.cancel();

    const taskCancellation = new CancellationTokenSource();
    this.currentTaskCancellation.value = taskCancellation;

    return taskCancellation;
  }
}

export class DebouncedTaskRunner<T> implements Disposable {
  private activeRun: DebouncedTaskRun<T> | null = null;
  private isDisposed = false;
  private pendingRun: PromiseWithResolvers<T> | null = null;
  private timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  constructor(
    private readonly runner: (cancellationToken: CancellationToken) => T | PromiseLike<T>,
    private readonly delayMs: number,
  ) {}

  run() {
    if (this.isDisposed) {
      return Promise.reject(new CancellationError());
    }

    this.pendingRun ??= Promise.withResolvers<T>();

    if (!this.activeRun) {
      this.schedulePendingRun();
    }

    return this.pendingRun.promise;
  }

  cancel() {
    this.cancelPendingRun();
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.cancelPendingRun();
    this.cancelActiveRun();
  }

  private schedulePendingRun() {
    if (!this.pendingRun || this.activeRun || this.isDisposed) {
      return;
    }

    if (this.timeoutId !== undefined) {
      globalThis.clearTimeout(this.timeoutId);
    }

    this.timeoutId = globalThis.setTimeout(() => {
      this.timeoutId = undefined;
      void this.startPendingRun();
    }, this.delayMs);
  }

  private async startPendingRun() {
    if (!this.pendingRun || this.activeRun || this.isDisposed) {
      return;
    }

    const activeRun: DebouncedTaskRun<T> = {
      cancellation: new CancellationTokenSource(),
      deferred: this.pendingRun,
    };
    this.pendingRun = null;
    this.activeRun = activeRun;

    try {
      const result = await runTaskAsPromise(() => this.runner(activeRun.cancellation.token));

      if (this.activeRun === activeRun) {
        activeRun.deferred.resolve(result);
      }
    } catch (error) {
      if (this.activeRun === activeRun) {
        activeRun.deferred.reject(error);
      }
    } finally {
      if (this.activeRun === activeRun) {
        this.activeRun = null;
        this.schedulePendingRun();
      }
    }
  }

  private cancelPendingRun() {
    if (this.timeoutId !== undefined) {
      globalThis.clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    const pendingRun = this.pendingRun;
    this.pendingRun = null;
    pendingRun?.reject(new CancellationError());
  }

  private cancelActiveRun() {
    const activeRun = this.activeRun;

    if (!activeRun) {
      return;
    }

    this.activeRun = null;
    activeRun.cancellation.cancel();
    activeRun.deferred.reject(new CancellationError());
  }
}
