import type {
  ActiveDocumentState,
  SavedDocumentState,
  UntitledDocumentState,
} from "@/features/document";
import { useArticleNavigatorStore } from "@/features/folder-context";
import {
  useSessionHistoryStore,
  useSessionStore,
  type SessionHistoryState,
  type SessionState,
} from "@/features/session";
import {
  getSystemDefaultLineEnding,
  useSettingsStore,
  type SettingsState,
} from "@/features/preferences";

export function setDefaultSettings(settings: Partial<SettingsState> = {}) {
  useSettingsStore.setState({
    theme: "system",
    recordRecentItems: true,
    sidebarVisible: true,
    articleSortOrder: "name",
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
    fileTreeSortOrder: null,
    recentFiles: [],
    recentFolders: [],
    persistenceVersion: 0,
    ...settings,
  });
}

export function setDefaultHistory(history: Partial<SessionHistoryState> = {}) {
  useSessionHistoryStore.setState({
    recentFiles: [],
    recentFolders: [],
    persistenceVersion: 1,
    ...history,
  });
}

type TestSavedDocumentState = Omit<SavedDocumentState, "isDirty"> &
  Partial<Pick<SavedDocumentState, "isDirty">>;
type TestUntitledDocumentState = Omit<UntitledDocumentState, "isDirty"> &
  Partial<Pick<UntitledDocumentState, "isDirty">>;
type TestActiveDocumentState = TestSavedDocumentState | TestUntitledDocumentState;

interface TestSessionState extends Omit<SessionState, "activeDocument"> {
  activeDocument: TestActiveDocumentState | null;
}

const toTestActiveDocumentState = (
  activeDocument: TestActiveDocumentState | null | undefined,
): ActiveDocumentState | null => {
  if (!activeDocument) {
    return null;
  }

  return {
    isDirty: false,
    ...activeDocument,
  } as ActiveDocumentState;
};

export function setDefaultSession(session: Partial<TestSessionState> = {}) {
  const { activeDocument, ...sessionRest } = session;

  useSessionStore.setState({
    folderContext: null,
    activeDocument: toTestActiveDocumentState(activeDocument),
    ...sessionRest,
  });
}

export function resetAppStores() {
  setDefaultSettings();
  setDefaultHistory();
  setDefaultSession();
  useArticleNavigatorStore.getState().reset();
}
