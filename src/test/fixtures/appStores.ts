import { useFileTreeViewStore } from "@/features/file-tree/stores/fileTreeView";
import {
  useSessionStore,
  type ActiveDocumentState,
  type SavedDocumentState,
  type SessionState,
  type UntitledDocumentState,
} from "@/stores/session";
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
  setDefaultSession();
  useFileTreeViewStore.getState().reset();
}
