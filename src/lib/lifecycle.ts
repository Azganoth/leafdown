export interface Disposable {
  dispose(): void;
}

export type DisposableLike = Disposable | (() => void);

export const toDisposable = (dispose: () => void): Disposable => ({ dispose });

const asDisposable = (disposable: DisposableLike): Disposable =>
  typeof disposable === "function" ? toDisposable(disposable) : disposable;

export class MutableDisposable<T extends DisposableLike = Disposable> implements Disposable {
  private currentDisposable: Disposable | null = null;
  private currentValue: T | null = null;
  private isDisposed = false;

  get value() {
    return this.currentValue;
  }

  set value(value: T | null) {
    if (this.currentValue === value) {
      return;
    }

    this.clear();

    if (!value) {
      return;
    }

    const disposable = asDisposable(value);

    if (this.isDisposed) {
      disposable.dispose();
      return;
    }

    this.currentDisposable = disposable;
    this.currentValue = value;
  }

  clear() {
    const currentDisposable = this.currentDisposable;

    this.currentDisposable = null;
    this.currentValue = null;
    currentDisposable?.dispose();
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.clear();
  }
}

export class DisposableStore implements Disposable {
  private readonly disposables = new Set<Disposable>();
  private isDisposed = false;

  add<T extends DisposableLike>(disposable: T): T {
    const nextDisposable = asDisposable(disposable);

    if (this.isDisposed) {
      nextDisposable.dispose();
      return disposable;
    }

    this.disposables.add(nextDisposable);
    return disposable;
  }

  clear() {
    for (const disposable of Array.from(this.disposables)) {
      this.disposables.delete(disposable);
      disposable.dispose();
    }
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.clear();
  }
}

interface DisposableMapEntry<Value extends DisposableLike> {
  disposable: Disposable;
  value: Value;
}

export class DisposableMap<Key, Value extends DisposableLike = Disposable> implements Disposable {
  private readonly disposables = new Map<Key, DisposableMapEntry<Value>>();
  private isDisposed = false;

  get size() {
    return this.disposables.size;
  }

  get(key: Key) {
    return this.disposables.get(key)?.value;
  }

  has(key: Key) {
    return this.disposables.has(key);
  }

  set(key: Key, value: Value): Value {
    const currentEntry = this.disposables.get(key);

    if (currentEntry?.value === value) {
      return value;
    }

    const disposable = asDisposable(value);

    if (this.isDisposed) {
      disposable.dispose();
      return value;
    }

    currentEntry?.disposable.dispose();
    this.disposables.set(key, { disposable, value });

    return value;
  }

  deleteAndDispose(key: Key) {
    const entry = this.disposables.get(key);

    if (!entry) {
      return false;
    }

    this.disposables.delete(key);
    entry.disposable.dispose();

    return true;
  }

  clear() {
    for (const [key, entry] of Array.from(this.disposables)) {
      this.disposables.delete(key);
      entry.disposable.dispose();
    }
  }

  dispose() {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    this.clear();
  }
}
