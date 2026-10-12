import { create } from "zustand";

import { PathSet } from "@/lib/path";

import type { WindowDocumentsSnapshot } from "../services/windowDocumentsApi";

export interface OtherWindowDocumentsState {
  /** The newest snapshot applied, so an older one arriving late is ignored. */
  revision: number;
  /** Saved documents other windows hold with unsaved changes. */
  unsavedPaths: PathSet;
  applySnapshot: (snapshot: WindowDocumentsSnapshot, ownWindowLabel: string) => void;
}

export const useOtherWindowDocumentsStore = create<OtherWindowDocumentsState>()((set, get) => ({
  revision: 0,
  unsavedPaths: new PathSet(),
  applySnapshot: ({ revision, windows }, ownWindowLabel) => {
    if (revision <= get().revision) {
      return;
    }

    set({
      revision,
      unsavedPaths: new PathSet(
        windows.flatMap(({ documents, windowLabel }) =>
          windowLabel === ownWindowLabel
            ? []
            : documents.flatMap(({ path, unsaved }) => (unsaved ? [path] : [])),
        ),
      ),
    });
  },
}));

export const isUnsavedInOtherWindow = (path: string) =>
  useOtherWindowDocumentsStore.getState().unsavedPaths.has(path);
