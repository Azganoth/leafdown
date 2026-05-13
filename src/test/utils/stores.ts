import { useSettingsStore, type SettingsStore } from "@/stores/settings";

export function setDefaultSettings(settings: Partial<Pick<SettingsStore, "theme">> = {}) {
  useSettingsStore.setState({
    theme: "system",
    ...settings,
  });
}

export function resetAppStores() {
  setDefaultSettings();
}
