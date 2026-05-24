import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface SettingsState {
  theme: "light" | "dark" | "system";
  autoPairBracketsAndQuotes: boolean;
  softWrapCodeBlocks: boolean;
}

export interface SettingsStore extends SettingsState {
  setTheme: (theme: SettingsState["theme"]) => void;
  setAutoPairBracketsAndQuotes: (enabled: boolean) => void;
  setSoftWrapCodeBlocks: (enabled: boolean) => void;

  reset: () => Promise<void>;
  init: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()(
  immer((set, get, store) => ({
    theme: "system",
    autoPairBracketsAndQuotes: true,
    softWrapCodeBlocks: false,

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
      }),
    setAutoPairBracketsAndQuotes: (enabled) =>
      set((state) => {
        state.autoPairBracketsAndQuotes = enabled;
      }),
    setSoftWrapCodeBlocks: (enabled) =>
      set((state) => {
        state.softWrapCodeBlocks = enabled;
      }),

    reset: async () => {
      set(() => store.getInitialState());
    },
    init: async () => {},
  })),
);

export const settingsStoreTauriHandler = createTauriStore("settings", useSettingsStore as never, {
  saveOnChange: true,
});
