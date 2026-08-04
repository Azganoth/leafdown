import type { Disposable } from "./lifecycle";
import { Signal, SignalSource } from "./signal";

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  readonly onCancellationRequested: Signal<void>;
}

class ImmutableCancellationToken implements CancellationToken {
  readonly onCancellationRequested: Signal<void>;

  constructor(readonly isCancellationRequested: boolean) {
    this.onCancellationRequested = isCancellationRequested
      ? (listener) => {
          listener();
          return Signal.None(listener);
        }
      : Signal.None;
  }
}

class MutableCancellationToken implements CancellationToken {
  private readonly cancellationRequested = new SignalSource<void>();
  private isCancelled = false;

  get isCancellationRequested() {
    return this.isCancelled;
  }

  onCancellationRequested = (listener: () => void) => {
    if (this.isCancellationRequested) {
      listener();
      return Signal.None(listener);
    }

    return this.cancellationRequested.signal(listener);
  };

  cancel() {
    if (this.isCancellationRequested) {
      return;
    }

    this.isCancelled = true;
    this.cancellationRequested.notify();
    this.cancellationRequested.dispose();
  }
}

export const CancellationToken = {
  Cancelled: new ImmutableCancellationToken(true),
  None: new ImmutableCancellationToken(false),
} as const;

export class CancellationError extends Error {
  constructor(message = "Operation cancelled.") {
    super(message);
    this.name = "CancellationError";
  }
}

export const isCancellationError = (error: unknown) => error instanceof CancellationError;

export const throwIfCancelled = (token: CancellationToken) => {
  if (token.isCancellationRequested) {
    throw new CancellationError();
  }
};

export const raceWithCancellation = async <T>(
  token: CancellationToken,
  task: () => T | PromiseLike<T>,
) => {
  throwIfCancelled(token);

  const { promise, reject } = Promise.withResolvers<never>();
  const listenerDisposable = token.onCancellationRequested(() => {
    reject(new CancellationError());
  });

  try {
    return await Promise.race([Promise.try(task), promise]);
  } finally {
    listenerDisposable.dispose();
  }
};

export const runWithCancellation = async <T>(token: CancellationToken, task: () => Promise<T>) => {
  throwIfCancelled(token);

  try {
    const result = await task();
    throwIfCancelled(token);
    return result;
  } catch (error) {
    if (!isCancellationError(error)) {
      throwIfCancelled(token);
    }

    throw error;
  }
};

export class CancellationTokenSource implements Disposable {
  private readonly mutableToken = new MutableCancellationToken();

  get token(): CancellationToken {
    return this.mutableToken;
  }

  cancel() {
    this.mutableToken.cancel();
  }

  dispose() {
    this.cancel();
  }
}
