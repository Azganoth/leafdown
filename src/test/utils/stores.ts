import { useSessionStore, type SessionState } from "@/stores/session";
import { useSettingsStore, type SettingsState } from "@/stores/settings";

export function setDefaultSettings(settings: Partial<SettingsState> = {}) {
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
