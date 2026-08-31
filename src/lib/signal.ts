import { type Disposable, toDisposable } from "./lifecycle";

export type Signal<T = void> = (listener: (value: T) => void) => Disposable;

const noop = () => {};

const NOOP_SIGNAL_DISPOSABLE = toDisposable(noop);

const toSignalDisposable = (dispose: () => void): Disposable => {
  let isDisposed = false;

  return toDisposable(() => {
    if (isDisposed) {
      return;
    }

    isDisposed = true;
    dispose();
  });
};

const signalNone = (_listener: (value: never) => void) => NOOP_SIGNAL_DISPOSABLE;

const once =
  <T>(signal: Signal<T>): Signal<T> =>
  (listener) => {
    let didFire = false;
    let didSubscribe = false;
    let shouldDispose = false;

    const listenerDisposable = signal((value) => {
      if (didFire) {
        return;
      }

      didFire = true;

      if (didSubscribe) {
        listenerDisposable.dispose();
      } else {
        shouldDispose = true;
      }

      listener(value);
    });
    didSubscribe = true;

    if (shouldDispose) {
      listenerDisposable.dispose();
    }

    return toSignalDisposable(() => listenerDisposable.dispose());
  };

const toPromise = <T>(signal: Signal<T>) => {
  const { promise, resolve } = Promise.withResolvers<T>();
  once(signal)(resolve);
  return promise;
};

export const Signal = {
  None: signalNone,
  once,
  toPromise,
} as const;

export class SignalSource<T = void> implements Disposable {
  private readonly listeners = new Set<(value: T) => void>();
  private isDisposed = false;

  readonly signal: Signal<T> = (listener) => {
    if (this.isDisposed) {
      return Signal.None(listener);
    }

    this.listeners.add(listener);

    return toSignalDisposable(() => {
      this.listeners.delete(listener);
    });
  };

  notify(value: T): void {
    if (this.isDisposed) {
      return;
    }

    for (const listener of Array.from(this.listeners)) {
      listener(value);
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.listeners.clear();
  }
}
