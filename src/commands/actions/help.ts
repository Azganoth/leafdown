import { invoke } from "@tauri-apps/api/core";

import { notifyOperationFailure } from "@/lib/errors";

import { useCommandUIStore } from "../stores/commandUi";

export const openDevTools = async () => {
  try {
    await invoke("open_webview_devtools");
  } catch (error) {
    notifyOperationFailure("Could not open DevTools.", error, "help.openDevTools");
  }
};

export const openAbout = () => {
  useCommandUIStore.getState().setAboutOpen(true);
};
