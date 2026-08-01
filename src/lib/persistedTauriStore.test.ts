import { createTauriStore } from "@tauri-store/zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

import { createPersistedTauriStore, definePersistedState } from "./persistedTauriStore";
import { booleanValue, listOf, numberValue, stringValue } from "./valueContract";

interface TestStore {
  enabled: boolean;
  name: string;
  version: number;
}

const asTestStore = (state: unknown) => state as TestStore;

type TauriStoreOptions = NonNullable<Parameters<typeof createTauriStore>[2]>;

const latestTauriStoreOptions = () => {
  const options = vi.mocked(createTauriStore).mock.calls.at(-1)?.[2];

  expect(options).toBeDefined();

  return options as TauriStoreOptions;
};

describe("createPersistedTauriStore", () => {
  beforeEach(() => {
    vi.mocked(createTauriStore).mockClear();
  });

  it("standardizes persisted keys and Tauri store options", () => {
    const useTestStore = create<TestStore>(() => ({
      enabled: false,
      name: "current",
      version: 2,
    }));

    createPersistedTauriStore<TestStore>("test", useTestStore, {
      keys: ["enabled", "name"],
      version: 2,
    });

    expect(createTauriStore).toHaveBeenCalledWith(
      "test",
      useTestStore,
      expect.objectContaining({
        filterKeys: ["enabled", "name", "version"],
        filterKeysStrategy: "pick",
        saveOnChange: true,
      }),
    );
  });

  it("runs migrations while loading frontend state and saves the upgraded store once", async () => {
    const useTestStore = create<TestStore>(() => ({
      enabled: false,
      name: "current",
      version: 2,
    }));
    const handler = createPersistedTauriStore<TestStore>("test", useTestStore, {
      keys: ["enabled", "name"],
      migrations: [
        {
          version: 2,
          migrate: (state) => {
            state.enabled = true;
          },
        },
        {
          version: 1,
          migrate: (state) => {
            state.name = "migrated";
          },
        },
      ],
      version: 2,
    });
    const options = latestTauriStoreOptions();

    const migratedState = options.hooks?.beforeFrontendSync?.({
      enabled: false,
      name: "legacy",
      version: 0,
    });
    useTestStore.setState(asTestStore(migratedState));
    const listener = vi.fn();
    const unsubscribe = useTestStore.subscribe(listener);

    await handler.start();

    expect(migratedState).toEqual({
      enabled: true,
      name: "migrated",
      version: 2,
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(migratedState, migratedState);
    expect(handler.saveNow).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("does not re-emit loaded state after startup when it is current", async () => {
    const useTestStore = create<TestStore>(() => ({
      enabled: true,
      name: "current",
      version: 2,
    }));
    const handler = createPersistedTauriStore<TestStore>("test", useTestStore, {
      keys: ["enabled", "name"],
      sanitize: (state) => ({ changed: false, state }),
      version: 2,
    });
    const options = latestTauriStoreOptions();

    const currentState = {
      enabled: true,
      name: "current",
      version: 2,
    };
    const listener = vi.fn();
    const unsubscribe = useTestStore.subscribe(listener);

    expect(options.hooks?.beforeFrontendSync?.(currentState)).toBe(currentState);

    await handler.start();

    expect(listener).not.toHaveBeenCalled();
    expect(handler.saveNow).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("re-emits sanitized current state after startup for persistence", async () => {
    const useTestStore = create<TestStore>(() => ({
      enabled: false,
      name: "current",
      version: 2,
    }));
    const handler = createPersistedTauriStore<TestStore>("test", useTestStore, {
      keys: ["enabled", "name"],
      sanitize: (state) => ({
        changed: true,
        state: { ...state, name: "sanitized" },
      }),
      version: 2,
    });
    const options = latestTauriStoreOptions();
    const syncedState = options.hooks?.beforeFrontendSync?.({
      enabled: false,
      name: 7,
      version: 2,
    } as never);

    useTestStore.setState(asTestStore(syncedState));
    const listener = vi.fn();
    const unsubscribe = useTestStore.subscribe(listener);

    await handler.start();

    expect(syncedState).toEqual({
      enabled: false,
      name: "sanitized",
      version: 2,
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(syncedState, syncedState);
    unsubscribe();
  });

  it("sanitizes loaded state after migrations and re-emits it for persistence", async () => {
    const useTestStore = create<TestStore>(() => ({
      enabled: false,
      name: "current",
      version: 2,
    }));
    const sanitize = vi.fn((state: Partial<TestStore>) => ({
      changed: true,
      state: { ...state, name: "sanitized" },
    }));

    const handler = createPersistedTauriStore<TestStore>("test", useTestStore, {
      keys: ["enabled", "name"],
      migrations: [
        {
          version: 2,
          migrate: (state) => {
            state.enabled = true;
          },
        },
      ],
      sanitize,
      version: 2,
    });
    const options = latestTauriStoreOptions();

    const syncedState = options.hooks?.beforeFrontendSync?.({
      enabled: false,
      name: "legacy",
      version: 0,
    });
    useTestStore.setState(asTestStore(syncedState));
    const listener = vi.fn();
    const unsubscribe = useTestStore.subscribe(listener);

    await handler.start();

    expect(sanitize).toHaveBeenCalledWith({ enabled: true, name: "legacy", version: 2 });
    expect(syncedState).toEqual({ enabled: true, name: "sanitized", version: 2 });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(syncedState, syncedState);
    unsubscribe();
  });

  it("skips completed migrations while upgrading to the target version", async () => {
    const useTestStore = create<TestStore>(() => ({
      enabled: false,
      name: "current",
      version: 3,
    }));
    const handler = createPersistedTauriStore<TestStore>("test", useTestStore, {
      keys: ["enabled", "name"],
      migrations: [
        {
          version: 1,
          migrate: (state) => {
            state.name = "skipped";
          },
        },
        {
          version: 3,
          migrate: (state) => {
            state.enabled = true;
          },
        },
      ],
      version: 3,
    });
    const options = latestTauriStoreOptions();

    const migratedState = options.hooks?.beforeFrontendSync?.({
      enabled: false,
      name: "already migrated",
      version: 1,
    });
    useTestStore.setState(asTestStore(migratedState));
    const listener = vi.fn();
    const unsubscribe = useTestStore.subscribe(listener);

    await handler.start();

    expect(migratedState).toEqual({
      enabled: true,
      name: "already migrated",
      version: 3,
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(migratedState, migratedState);
    expect(handler.saveNow).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe("definePersistedState", () => {
  const contract = definePersistedState({
    enabled: booleanValue,
    names: listOf(stringValue),
    version: numberValue,
  });

  it("derives the persisted keys from the shape, excluding the version", () => {
    expect(contract.keys).toEqual(["enabled", "names"]);
  });

  it("reports an untouched state as unchanged and returns it as-is", () => {
    const state = { enabled: true, version: 1 };
    const result = contract.sanitize(state);

    expect(result.changed).toBe(false);
    expect(result.state).toBe(state);
  });

  it("reports a repaired state as changed", () => {
    expect(contract.sanitize({ enabled: "yes", version: 1 } as never)).toEqual({
      changed: true,
      state: { version: 1 },
    });
  });

  it("reports an unusable state as changed and empties it", () => {
    expect(contract.sanitize(["enabled"] as never)).toEqual({ changed: true, state: {} });
  });
});
