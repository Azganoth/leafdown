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
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;

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
    updateSetting: (key, value) =>
      set((state) => {
        // @ts-expect-error - safe dynamic generic assignment
        state[key] = value;
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
