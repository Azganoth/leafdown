import { create } from "zustand";

import type { ArticleSortOrder } from "@/features/folder-context";

export interface CommandUIState {
  aboutOpen: boolean;
  preferencesOpen: boolean;
  fullscreen: boolean;
  zoom: number;
  pendingSortOrder: ArticleSortOrder | null;
  setAboutOpen: (open: boolean) => void;
  setPreferencesOpen: (open: boolean) => void;
  setFullscreen: (fullscreen: boolean) => void;
  setZoom: (zoom: number) => void;
  setPendingSortOrder: (pendingSortOrder: ArticleSortOrder | null) => void;
}

export const useCommandUIStore = create<CommandUIState>()((set) => ({
  aboutOpen: false,
  preferencesOpen: false,
  fullscreen: false,
  zoom: 1,
  pendingSortOrder: null,
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setPreferencesOpen: (preferencesOpen) => set({ preferencesOpen }),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setZoom: (zoom) => set({ zoom }),
  setPendingSortOrder: (pendingSortOrder) => set({ pendingSortOrder }),
}));
