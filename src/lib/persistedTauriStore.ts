import { createTauriStore } from "@tauri-store/zustand";

import { salvagedRecord, type ContractShape, type ShapeValue } from "@/lib/valueContract";

interface VersionedState {
  version: number;
}

interface PersistedTauriStoreMigration<State extends VersionedState> {
  version: number;
  migrate: (state: State) => void;
}

export type PersistedTauriStoreKey<State extends VersionedState> = Exclude<
  Extract<keyof State, string>,
  "version"
>;

interface PersistedTauriStore<State extends VersionedState> {
  getState: () => State;
  setState: (state: Partial<State>) => void;
}

interface PersistedStateSanitization<State extends VersionedState> {
  changed: boolean;
  state: Partial<State>;
}

interface PersistedTauriStoreOptions<State extends VersionedState> {
  keys: readonly PersistedTauriStoreKey<State>[];
  migrations?: readonly PersistedTauriStoreMigration<State>[];
  // Persisted data is user-writable. Sanitize it after migrations so migrations
  // still receive the legacy shape, and report changes so the file can be repaired.
  sanitize?: (state: Partial<State>) => PersistedStateSanitization<State>;
  version: number;
}

const normalizeVersion = (version: unknown) =>
  Number.isInteger(version) && Number(version) >= 0 ? Number(version) : 0;

const toPersistedObject = <State extends VersionedState>(state: unknown): Partial<State> =>
  state && typeof state === "object" ? (state as Partial<State>) : {};

const runPersistedStateMigrations = <State extends VersionedState>(
  state: State,
  migrations: readonly PersistedTauriStoreMigration<State>[],
  targetVersion: number,
) => {
  let migrated = false;
  const pendingMigrations = [...migrations]
    .filter(({ version }) => state.version < version && version <= targetVersion)
    .sort((first, second) => first.version - second.version);

  for (const migration of pendingMigrations) {
    migration.migrate(state);
    state.version = migration.version;
    migrated = true;
  }

  if (state.version < targetVersion) {
    state.version = targetVersion;
    migrated = true;
  }

  return migrated;
};

export const createPersistedTauriStore = <State extends VersionedState>(
  id: string,
  store: PersistedTauriStore<State>,
  { keys, migrations = [], sanitize, version }: PersistedTauriStoreOptions<State>,
) => {
  let needsPersistedStateRepair = false;
  const handler = createTauriStore(
    id,
    store as never,
    {
      filterKeys: [...keys, "version"],
      filterKeysStrategy: "pick",
      hooks: {
        beforeFrontendSync: (state: unknown) => {
          const persistedState = toPersistedObject<State>(state);
          const migratedState = {
            ...persistedState,
            version: normalizeVersion(persistedState.version),
          } as State;

          const migrated = runPersistedStateMigrations(migratedState, migrations, version);
          needsPersistedStateRepair ||= migrated;

          const syncedState = migrated ? migratedState : persistedState;

          if (!sanitize) {
            return syncedState;
          }

          const sanitization = sanitize(syncedState);
          needsPersistedStateRepair ||= sanitization.changed;

          return sanitization.state;
        },
      },
      saveOnChange: true,
    } as never,
  );
  const start = handler.start.bind(handler);

  handler.start = async () => {
    await start();

    if (!needsPersistedStateRepair) {
      return;
    }

    // The persistence plugin starts watching after its initial frontend sync.
    // Re-emit the merged state so saveOnChange replaces the backend state and file.
    store.setState({ ...store.getState() });
    needsPersistedStateRepair = false;
  };

  return handler;
};

interface PersistedStateContract<Shape extends ContractShape> {
  // Mirrors PersistedTauriStoreKey, which cannot apply here because a contracted
  // shape makes every field optional and so never satisfies VersionedState.
  keys: Exclude<Extract<keyof Shape, string>, "version">[];
  sanitize: (state: ShapeValue<Shape>) => {
    changed: boolean;
    state: ShapeValue<Shape>;
  };
}

// Deriving both from one shape keeps a field from being validated but not persisted:
// the persisted key list is not checked for exhaustiveness anywhere else.
export const definePersistedState = <Shape extends ContractShape>(
  shape: Shape,
): PersistedStateContract<Shape> => {
  const contract = salvagedRecord(shape);

  return {
    keys: Object.keys(shape).filter(
      (key) => key !== "version",
    ) as PersistedStateContract<Shape>["keys"],

    sanitize: (state) => {
      const checked = contract.check(state);

      if (checked.outcome === "valid") {
        // Returning the original keeps the untouched path free of a needless copy.
        return { changed: false, state };
      }

      return { changed: true, state: checked.outcome === "repaired" ? checked.value : {} };
    },
  };
};
