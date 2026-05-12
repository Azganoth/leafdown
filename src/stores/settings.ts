import { createTauriStore } from "@tauri-store/zustand";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface SettingsStore {
  theme: "light" | "dark" | "system";

  setTheme: (theme: SettingsStore["theme"]) => void;

  reset: () => Promise<void>;
  init: () => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>()(
  immer((set, get, store) => ({
    theme: "system",

    setTheme: (theme) =>
      set((state) => {
        state.theme = theme;
      }),

    reset: async () => {
      set(() => store.getInitialState());
    },
    init: async () => {},
  })),
);

export const settingsStoreTauriHandler = createTauriStore(
  "settings",
  useSettingsStore as never,
  {
    saveOnChange: true,
  },
);
