import { createTauriStore } from "@tauri-store/zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

import { createPersistedTauriStore } from "./persistedTauriStore";

interface TestStore {
  enabled: boolean;
  name: string;
  version: number;
}

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
    await handler.start();

    expect(migratedState).toEqual({
      enabled: true,
      name: "migrated",
      version: 2,
    });
    expect(handler.saveNow).toHaveBeenCalledTimes(1);
  });

  it("does not save after startup when loaded state is current", async () => {
    const useTestStore = create<TestStore>(() => ({
      enabled: true,
      name: "current",
      version: 2,
    }));
    const handler = createPersistedTauriStore<TestStore>("test", useTestStore, {
      keys: ["enabled", "name"],
      version: 2,
    });
    const options = latestTauriStoreOptions();

    const currentState = {
      enabled: true,
      name: "current",
      version: 2,
    };

    expect(options.hooks?.beforeFrontendSync?.(currentState)).toBe(currentState);

    await handler.start();

    expect(handler.saveNow).not.toHaveBeenCalled();
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
    await handler.start();

    expect(migratedState).toEqual({
      enabled: true,
      name: "already migrated",
      version: 3,
    });
    expect(handler.saveNow).toHaveBeenCalledTimes(1);
  });
});
