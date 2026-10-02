import { create } from "zustand";

import type { ArticleSortOrder } from "@/features/folder-context";
import type { HelpPageId } from "@/features/help";

export interface CommandUIState {
  aboutOpen: boolean;
  commandPaletteOpen: boolean;
  diagnosticsOpen: boolean;
  helpPage: HelpPageId | null;
  keyboardShortcutsOpen: boolean;
  preferencesOpen: boolean;
  fullscreen: boolean;
  zoom: number;
  pendingSortOrder: ArticleSortOrder | null;
  setAboutOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setDiagnosticsOpen: (open: boolean) => void;
  setHelpPage: (page: HelpPageId | null) => void;
  setKeyboardShortcutsOpen: (open: boolean) => void;
  setPreferencesOpen: (open: boolean) => void;
  setFullscreen: (fullscreen: boolean) => void;
  setZoom: (zoom: number) => void;
  setPendingSortOrder: (pendingSortOrder: ArticleSortOrder | null) => void;
}

let commandPaletteOpener: HTMLElement | null = null;

export const getCommandPaletteOpener = () => commandPaletteOpener;

export const useCommandUIStore = create<CommandUIState>()((set) => ({
  aboutOpen: false,
  commandPaletteOpen: false,
  diagnosticsOpen: false,
  helpPage: null,
  keyboardShortcutsOpen: false,
  preferencesOpen: false,
  fullscreen: false,
  zoom: 1,
  pendingSortOrder: null,
  setAboutOpen: (aboutOpen) => set({ aboutOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => {
    if (commandPaletteOpen && !useCommandUIStore.getState().commandPaletteOpen) {
      commandPaletteOpener =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    set({ commandPaletteOpen });
  },
  setDiagnosticsOpen: (diagnosticsOpen) => set({ diagnosticsOpen }),
  setHelpPage: (helpPage) => set({ helpPage }),
  setKeyboardShortcutsOpen: (keyboardShortcutsOpen) => set({ keyboardShortcutsOpen }),
  setPreferencesOpen: (preferencesOpen) => set({ preferencesOpen }),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setZoom: (zoom) => set({ zoom }),
  setPendingSortOrder: (pendingSortOrder) => set({ pendingSortOrder }),
}));
