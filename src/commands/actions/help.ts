import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

import { formatDiagnosticsSummary, getDiagnosticsSummary } from "@/features/diagnostics";
import { notifyOperationFailure } from "@/lib/errors";
import { notifySuccess } from "@/lib/toast";

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

export const openLogsFolder = async () => {
  try {
    const summary = await getDiagnosticsSummary();
    await openPath(summary.logDirectoryPath);
  } catch (error) {
    notifyOperationFailure("Could not open logs folder.", error, "help.openLogsFolder");
  }
};

export const copyDiagnosticsSummary = async () => {
  try {
    const clipboard = navigator.clipboard;

    if (!clipboard?.writeText) {
      throw new Error("Clipboard is unavailable.");
    }

    const summary = await getDiagnosticsSummary();
    await clipboard.writeText(formatDiagnosticsSummary(summary));
    notifySuccess("Diagnostics summary copied.");
  } catch (error) {
    notifyOperationFailure(
      "Could not copy diagnostics summary.",
      error,
      "help.copyDiagnosticsSummary",
    );
  }
};

export const openAbout = () => {
  useCommandUIStore.getState().setAboutOpen(true);
};
