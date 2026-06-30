import { describe, expect, it, vi } from "vitest";

import { Signal, SignalSource } from "./signal";

describe("Signal", () => {
  it("creates idempotent listener disposables", () => {
    const source = new SignalSource<string>();
    const listener = vi.fn();
    const listenerDisposable = source.signal(listener);

    listenerDisposable.dispose();
    listenerDisposable.dispose();
    source.notify("ignored");

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores listeners subscribed to the empty signal", () => {
    const listener = vi.fn();
    const listenerDisposable = Signal.None(listener);

    listenerDisposable.dispose();

    expect(listener).not.toHaveBeenCalled();
  });

  it("subscribes to only one signal", () => {
    const source = new SignalSource<string>();
    const listener = vi.fn();

    Signal.once(source.signal)(listener);

    source.notify("first");
    source.notify("second");

    expect(listener).toHaveBeenCalledExactlyOnceWith("first");
  });

  it("handles one-shot signals that notify while subscribing", () => {
    const listener = vi.fn();
    const signal = Signal.once<string>((innerListener) => {
      innerListener("ready");
      return Signal.None(innerListener);
    });

    signal(listener);

    expect(listener).toHaveBeenCalledExactlyOnceWith("ready");
  });

  it("resolves a promise from the next signal", async () => {
    const source = new SignalSource<string>();
    const result = Signal.toPromise(source.signal);

    source.notify("updated");

    await expect(result).resolves.toBe("updated");
  });
});

describe("SignalSource", () => {
  it("notifies subscribed listeners", () => {
    const source = new SignalSource<string>();
    const listener = vi.fn();

    const listenerDisposable = source.signal(listener);

    source.notify("updated");

    expect(listener).toHaveBeenCalledWith("updated");

    listenerDisposable.dispose();
    source.notify("ignored");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("uses a stable listener snapshot while notifying", () => {
    const source = new SignalSource();
    const secondListener = vi.fn();
    const secondListenerDisposable = source.signal(secondListener);
    const firstListener = vi.fn(() => secondListenerDisposable.dispose());

    source.signal(firstListener);
    source.notify();

    expect(firstListener).toHaveBeenCalledOnce();
    expect(secondListener).toHaveBeenCalledOnce();
  });

  it("does not notify disposed listeners", () => {
    const source = new SignalSource<string>();
    const listener = vi.fn();

    source.signal(listener).dispose();
    source.notify("ignored");

    expect(listener).not.toHaveBeenCalled();
  });

  it("clears listeners when disposed", () => {
    const source = new SignalSource<string>();
    const listener = vi.fn();

    source.signal(listener);
    source.dispose();
    source.notify("ignored");
    source.signal(listener);
    source.notify("also ignored");

    expect(listener).not.toHaveBeenCalled();
  });
});
