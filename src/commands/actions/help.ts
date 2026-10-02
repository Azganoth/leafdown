import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { showChangelog, showWhatsNew } from "@/features/release-notes";
import { notifyOperationFailure } from "@/lib/errors";
import { t } from "@/lib/i18n";

import { useCommandUIStore } from "../stores/commandUi";

export const OPEN_WEBVIEW_DEVTOOLS_COMMAND = "open_webview_devtools";

export const openWebviewDevtools = () => invoke<void>(OPEN_WEBVIEW_DEVTOOLS_COMMAND);

export const openDevTools = async () => {
  try {
    await openWebviewDevtools();
  } catch (error) {
    notifyOperationFailure(t("commands.help.openDevToolsFailed"), error, "help.openDevTools");
  }
};

export const openDiagnostics = () => {
  useCommandUIStore.getState().setDiagnosticsOpen(true);
};

export const openKeyboardShortcuts = () => {
  useCommandUIStore.getState().setKeyboardShortcutsOpen(true);
};

export const openAbout = () => {
  useCommandUIStore.getState().setAboutOpen(true);
};

export const openMarkdownReference = () => {
  useCommandUIStore.getState().setHelpPage("markdown-reference");
};

export const openGettingStarted = () => {
  useCommandUIStore.getState().setHelpPage("getting-started");
};

export const openFileAndFolderWorkflows = () => {
  useCommandUIStore.getState().setHelpPage("file-and-folder-workflows");
};

export const openSettingsReference = () => {
  useCommandUIStore.getState().setHelpPage("settings-reference");
};

export const openWhatsNew = showWhatsNew;
export const openChangelog = showChangelog;

const openFeedbackForm = async (template: "bug.yml" | "feature.yml") => {
  try {
    await openUrl(`https://github.com/Azganoth/leafdown/issues/new?template=${template}`);
  } catch (error) {
    notifyOperationFailure(t("commands.help.openLinkFailed"), error, "help.openFeedbackForm");
  }
};

export const reportIssue = () => openFeedbackForm("bug.yml");

export const requestFeature = () => openFeedbackForm("feature.yml");
