import { getCurrentWindow } from "@tauri-apps/api/window";

import { createDefaultSettingsState, SETTINGS_VERSION, useSettingsStore } from "../stores/settings";

export const setAlwaysOnTop = async (alwaysOnTop: boolean) => {
  await getCurrentWindow().setAlwaysOnTop(alwaysOnTop);
  useSettingsStore.getState().updateSetting("alwaysOnTop", alwaysOnTop);
};

export const applyPersistedAlwaysOnTop = async () => {
  if (!useSettingsStore.getState().alwaysOnTop) {
    return;
  }

  try {
    await getCurrentWindow().setAlwaysOnTop(true);
  } catch (error) {
    useSettingsStore.getState().updateSetting("alwaysOnTop", false);
    throw error;
  }
};

/**
 * Applies the global always-on-top setting to this window whenever another window changes it, so
 * every window follows it. Returns the function that stops following.
 */
export const followAlwaysOnTopSetting = (onError: (error: unknown) => void) =>
  useSettingsStore.subscribe((state, previous) => {
    if (state.alwaysOnTop !== previous.alwaysOnTop) {
      getCurrentWindow().setAlwaysOnTop(state.alwaysOnTop).catch(onError);
    }
  });

export const restoreDefaultSettings = async () => {
  if (useSettingsStore.getState().alwaysOnTop) {
    try {
      await getCurrentWindow().setAlwaysOnTop(false);
    } catch (error) {
      useSettingsStore.setState({
        ...createDefaultSettingsState(),
        version: SETTINGS_VERSION,
        alwaysOnTop: true,
      });
      throw error;
    }
  }

  useSettingsStore.getState().reset();
};
