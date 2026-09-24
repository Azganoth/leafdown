import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

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

export const openDiagnostics = () => {
  useCommandUIStore.getState().setDiagnosticsOpen(true);
};

export const openAbout = () => {
  useCommandUIStore.getState().setAboutOpen(true);
};

const openFeedbackForm = async (template: "bug.yml" | "feature.yml") => {
  try {
    await openUrl(`https://github.com/Azganoth/leafdown/issues/new?template=${template}`);
  } catch (error) {
    notifyOperationFailure("Could not open the link.", error, "help.openFeedbackForm");
  }
};

export const reportIssue = () => openFeedbackForm("bug.yml");

export const requestFeature = () => openFeedbackForm("feature.yml");
