import { describe, expect, it, vi } from "vitest";

import { DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "./lifecycle";

describe("MutableDisposable", () => {
  it("disposes the current value when replaced", () => {
    const mutableDisposable = new MutableDisposable();
    const firstDisposable = toDisposable(vi.fn());
    const secondDisposable = toDisposable(vi.fn());

    mutableDisposable.value = firstDisposable;
    mutableDisposable.value = secondDisposable;

    expect(firstDisposable.dispose).toHaveBeenCalledOnce();
    expect(secondDisposable.dispose).not.toHaveBeenCalled();
    expect(mutableDisposable.value).toBe(secondDisposable);
  });

  it("clears the current value without disposing the holder", () => {
    const mutableDisposable = new MutableDisposable();
    const firstDisposable = toDisposable(vi.fn());
    const secondDisposable = toDisposable(vi.fn());

    mutableDisposable.value = firstDisposable;
    mutableDisposable.clear();
    mutableDisposable.value = secondDisposable;

    expect(firstDisposable.dispose).toHaveBeenCalledOnce();
    expect(secondDisposable.dispose).not.toHaveBeenCalled();
    expect(mutableDisposable.value).toBe(secondDisposable);
  });

  it("disposes assigned values after disposal", () => {
    const mutableDisposable = new MutableDisposable();
    const disposable = toDisposable(vi.fn());
    const lateDisposable = toDisposable(vi.fn());

    mutableDisposable.value = disposable;
    mutableDisposable.dispose();
    mutableDisposable.value = lateDisposable;

    expect(disposable.dispose).toHaveBeenCalledOnce();
    expect(lateDisposable.dispose).toHaveBeenCalledOnce();
    expect(mutableDisposable.value).toBeNull();
  });
});

describe("DisposableStore", () => {
  it("disposes registered cleanup functions", () => {
    const store = new DisposableStore();
    const cleanup = vi.fn();

    store.add(cleanup);
    store.dispose();

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("disposes registered disposable objects", () => {
    const store = new DisposableStore();
    const disposable = toDisposable(vi.fn());

    store.add(disposable);
    store.dispose();

    expect(disposable.dispose).toHaveBeenCalledOnce();
  });

  it("disposes values added after the store is disposed", () => {
    const store = new DisposableStore();
    const cleanup = vi.fn();

    store.dispose();
    store.add(cleanup);

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("clears registered disposables without disposing the store", () => {
    const store = new DisposableStore();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();

    store.add(firstCleanup);
    store.clear();
    store.add(secondCleanup);
    store.dispose();

    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(secondCleanup).toHaveBeenCalledOnce();
  });
});

describe("DisposableMap", () => {
  it("tracks keyed disposables", () => {
    const disposables = new DisposableMap<string>();
    const firstDisposable = toDisposable(vi.fn());
    const secondDisposable = toDisposable(vi.fn());

    disposables.set("first", firstDisposable);
    disposables.set("second", secondDisposable);

    expect(disposables.size).toBe(2);
    expect(disposables.has("first")).toBe(true);
    expect(disposables.get("second")).toBe(secondDisposable);
  });

  it("disposes replaced values", () => {
    const disposables = new DisposableMap<string>();
    const firstDisposable = toDisposable(vi.fn());
    const secondDisposable = toDisposable(vi.fn());

    disposables.set("listener", firstDisposable);
    disposables.set("listener", secondDisposable);

    expect(firstDisposable.dispose).toHaveBeenCalledOnce();
    expect(secondDisposable.dispose).not.toHaveBeenCalled();
    expect(disposables.get("listener")).toBe(secondDisposable);
  });

  it("keeps the same value when set again for the same key", () => {
    const disposables = new DisposableMap<string>();
    const disposable = toDisposable(vi.fn());

    disposables.set("listener", disposable);
    disposables.set("listener", disposable);

    expect(disposable.dispose).not.toHaveBeenCalled();
    expect(disposables.size).toBe(1);
  });

  it("deletes and disposes individual values", () => {
    const disposables = new DisposableMap<string>();
    const disposable = toDisposable(vi.fn());

    disposables.set("listener", disposable);

    expect(disposables.deleteAndDispose("listener")).toBe(true);
    expect(disposable.dispose).toHaveBeenCalledOnce();
    expect(disposables.has("listener")).toBe(false);
    expect(disposables.deleteAndDispose("listener")).toBe(false);
  });

  it("clears keyed values without disposing the map", () => {
    const disposables = new DisposableMap<string>();
    const firstDisposable = toDisposable(vi.fn());
    const secondDisposable = toDisposable(vi.fn());

    disposables.set("first", firstDisposable);
    disposables.clear();
    disposables.set("second", secondDisposable);
    disposables.dispose();

    expect(firstDisposable.dispose).toHaveBeenCalledOnce();
    expect(secondDisposable.dispose).toHaveBeenCalledOnce();
  });

  it("disposes values added after the map is disposed", () => {
    const disposables = new DisposableMap<string>();
    const disposable = toDisposable(vi.fn());

    disposables.dispose();
    disposables.set("late", disposable);

    expect(disposable.dispose).toHaveBeenCalledOnce();
    expect(disposables.size).toBe(0);
  });

  it("accepts cleanup functions as values", () => {
    const disposables = new DisposableMap<string, () => void>();
    const cleanup = vi.fn();

    disposables.set("cleanup", cleanup);
    disposables.dispose();

    expect(cleanup).toHaveBeenCalledOnce();
  });
});
