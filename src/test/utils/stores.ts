import { useSessionStore, type SessionState } from "@/stores/session";
import { useSettingsStore, type SettingsStore } from "@/stores/settings";

export function setDefaultSettings(settings: Partial<Pick<SettingsStore, "theme">> = {}) {
  useSettingsStore.setState({
    theme: "system",
    ...settings,
  });
}

export function setDefaultSession(session: Partial<SessionState> = {}) {
  useSessionStore.setState({
    folderContext: null,
    activeDocument: null,
    ...session,
  });
}

export function resetAppStores() {
  setDefaultSettings();
  setDefaultSession();
}
