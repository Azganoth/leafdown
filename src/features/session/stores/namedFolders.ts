import { create } from "zustand";

import type { NamedFolder, NamedFoldersSnapshot } from "../services/namedFoldersApi";

interface NamedFoldersState {
  folders: NamedFolder[];
  revision: number;
  activeId: string | null;
  transitioning: boolean;
  dialogOpen: boolean;
  applySnapshot: (snapshot: NamedFoldersSnapshot) => void;
}

export const useNamedFoldersStore = create<NamedFoldersState>((set) => ({
  folders: [],
  revision: -1,
  activeId: null,
  transitioning: false,
  dialogOpen: false,
  applySnapshot: (snapshot) =>
    set((state) =>
      snapshot.revision < state.revision
        ? state
        : {
            folders: snapshot.folders,
            revision: snapshot.revision,
          },
    ),
}));
