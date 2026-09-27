import { getCurrentWindow } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { setDefaultSettings } from "@/test/utils/appStores";

import { useSettingsStore } from "../stores/settings";
import {
  applyPersistedAlwaysOnTop,
  restoreDefaultSettings,
  setAlwaysOnTop,
} from "./windowPreferences";

describe("window preferences", () => {
  beforeEach(() => setDefaultSettings());

  it("persists always on top after the window accepts it", async () => {
    await setAlwaysOnTop(true);

    expect(getCurrentWindow().setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(useSettingsStore.getState().alwaysOnTop).toBe(true);
  });

  it("keeps the persisted always on top setting when the window rejects it", async () => {
    vi.mocked(getCurrentWindow().setAlwaysOnTop).mockRejectedValueOnce(
      new Error("window unavailable"),
    );

    await expect(setAlwaysOnTop(true)).rejects.toThrow("window unavailable");

    expect(useSettingsStore.getState().alwaysOnTop).toBe(false);
  });

  it("leaves the window alone at startup while always on top is off", async () => {
    await applyPersistedAlwaysOnTop();

    expect(getCurrentWindow().setAlwaysOnTop).not.toHaveBeenCalled();
  });

  it("applies persisted always on top at startup", async () => {
    setDefaultSettings({ alwaysOnTop: true });

    await applyPersistedAlwaysOnTop();

    expect(getCurrentWindow().setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(useSettingsStore.getState().alwaysOnTop).toBe(true);
  });

  it("repairs always on top to off when the startup window rejects it", async () => {
    vi.mocked(getCurrentWindow().setAlwaysOnTop).mockRejectedValueOnce(
      new Error("window unavailable"),
    );
    setDefaultSettings({ alwaysOnTop: true });

    await expect(applyPersistedAlwaysOnTop()).rejects.toThrow("window unavailable");

    expect(useSettingsStore.getState().alwaysOnTop).toBe(false);
  });

  it("turns the window's always on top off when restoring defaults", async () => {
    setDefaultSettings({ alwaysOnTop: true, sidebarVisible: false });

    await restoreDefaultSettings();

    expect(getCurrentWindow().setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(useSettingsStore.getState()).toMatchObject({
      alwaysOnTop: false,
      sidebarVisible: true,
    });
  });

  it("restores defaults without touching a window that is not on top", async () => {
    setDefaultSettings({ sidebarVisible: false });

    await restoreDefaultSettings();

    expect(getCurrentWindow().setAlwaysOnTop).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().sidebarVisible).toBe(true);
  });

  it("restores the other defaults but keeps always on top when the window rejects turning it off", async () => {
    vi.mocked(getCurrentWindow().setAlwaysOnTop).mockRejectedValueOnce(
      new Error("window unavailable"),
    );
    setDefaultSettings({ alwaysOnTop: true, sidebarVisible: false });

    await expect(restoreDefaultSettings()).rejects.toThrow("window unavailable");

    expect(useSettingsStore.getState()).toMatchObject({
      alwaysOnTop: true,
      sidebarVisible: true,
    });
  });
});
