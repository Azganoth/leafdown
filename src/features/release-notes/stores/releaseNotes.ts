import { create } from "zustand";

import { createPersistedTauriStore, definePersistedState } from "@/lib/persistedTauriStore";
import { listOf, numberValue, stringValue } from "@/lib/valueContract";

export type ReleaseNotesSurface = "whatsNew" | "changelog" | null;

export const RELEASE_NOTES_STATE_VERSION = 1;

export interface ReleaseNotesPersistedState {
  lastVersion: string;
  seenVersions: string[];
  version: number;
}

export interface ReleaseNotesStore extends ReleaseNotesPersistedState {
  currentVersion: string;
  surface: ReleaseNotesSurface;
  setCurrentVersion: (version: string) => void;
  setSurface: (surface: ReleaseNotesSurface) => void;
  recordLaunch: (version: string) => void;
  markSeen: (version: string) => void;
}

const RELEASE_NOTES_CONTRACT = definePersistedState({
  lastVersion: stringValue,
  seenVersions: listOf(stringValue),
  version: numberValue,
} satisfies Record<keyof ReleaseNotesPersistedState, unknown>);

export const sanitizeReleaseNotesPersistedState = RELEASE_NOTES_CONTRACT.sanitize;

export const useReleaseNotesStore = create<ReleaseNotesStore>()((set) => ({
  currentVersion: "",
  lastVersion: "",
  seenVersions: [],
  surface: null,
  version: RELEASE_NOTES_STATE_VERSION,
  setCurrentVersion: (currentVersion) => set({ currentVersion }),
  setSurface: (surface) => set({ surface }),
  recordLaunch: (lastVersion) => set({ lastVersion, currentVersion: lastVersion }),
  markSeen: (version) =>
    set((state) => ({
      seenVersions: state.seenVersions.includes(version)
        ? state.seenVersions
        : [...state.seenVersions, version],
    })),
}));

export const releaseNotesStoreTauriHandler = createPersistedTauriStore<ReleaseNotesPersistedState>(
  "release-notes",
  useReleaseNotesStore,
  { ...RELEASE_NOTES_CONTRACT, version: RELEASE_NOTES_STATE_VERSION },
);
