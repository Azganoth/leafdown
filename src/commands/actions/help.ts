import { invoke } from "@tauri-apps/api/core";

import { notifyOperationFailure } from "@/lib/errors";

import { useCommandUIStore } from "../stores/commandUi";

export const OPEN_WEBVIEW_DEVTOOLS_COMMAND = "open_webview_devtools";

export const openWebviewDevtools = () => invoke<void>(OPEN_WEBVIEW_DEVTOOLS_COMMAND);

export const openDevTools = async () => {
  try {
    await openWebviewDevtools();
  } catch (error) {
    notifyOperationFailure("Could not open DevTools.", error, "help.openDevTools");
  }
};

export const openAbout = () => {
  useCommandUIStore.getState().setAboutOpen(true);
};
