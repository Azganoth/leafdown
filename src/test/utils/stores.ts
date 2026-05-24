import { useSessionStore, type SessionState } from "@/stores/session";
import {
  getSystemDefaultLineEnding,
  useSettingsStore,
  type SettingsState,
} from "@/stores/settings";

export function setDefaultSettings(settings: Partial<SettingsState> = {}) {
  useSettingsStore.setState({
    theme: "system",
    recordRecentItems: true,
    recentFiles: [],
    recentFolders: [],
    sidebarVisible: true,
    fileTreeSortOrder: "name",
    defaultNewDocumentExtension: ".md",
    defaultNewDocumentLineEnding: getSystemDefaultLineEnding(),
    insertFinalNewline: true,
    indexFileNames: ["readme", "index"],
    ignoredDirectories: [
      ".git",
      ".hg",
      ".svn",
      "node_modules",
      "target",
      "dist",
      "build",
      ".cache",
    ],
    autoPairBracketsAndQuotes: true,
    softWrapCodeBlocks: false,
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
