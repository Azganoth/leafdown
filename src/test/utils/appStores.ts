import { useCommandUIStore, type CommandUIState } from "@/commands/stores/commandUi";
import type {
  ActiveDocumentState,
  SavedDocumentState,
  UntitledDocumentState,
} from "@/features/document";
import { useArticleNavigatorStore } from "@/features/folder-context";
// Deep import by design: the feature root loads the editor for its search engine.
import { useFolderSearchStore } from "@/features/folder-search/stores/folderSearch";
import {
  createDefaultSettingsState,
  RECENT_ITEMS_VERSION,
  SETTINGS_VERSION,
  useRecentItemsStore,
  useSettingsStore,
  type RecentItemsState,
  type SettingsPersistedState,
} from "@/features/preferences";
import { RELEASE_NOTES_STATE_VERSION, useReleaseNotesStore } from "@/features/release-notes";
// Deep import by design: `@/features/session` re-exports `documentEditorBridge`, and the
// beforeEach in ../setup/common.ts loads this module for every test file.
import { useSessionStore, type SessionState } from "@/features/session/stores/session";

export const setDefaultSettings = (settings: Partial<SettingsPersistedState> = {}) => {
  useSettingsStore.setState({
    ...createDefaultSettingsState(),
    version: SETTINGS_VERSION,
    ...settings,
  });
};

export const setDefaultRecentItems = (recentItems: Partial<RecentItemsState> = {}) => {
  const initialRecentItems = useRecentItemsStore.getInitialState();

  useRecentItemsStore.setState({
    ...initialRecentItems,
    recentFiles: [...initialRecentItems.recentFiles],
    recentFolders: [...initialRecentItems.recentFolders],
    version: RECENT_ITEMS_VERSION,
    ...recentItems,
  });
};

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
): ActiveDocumentState | null =>
  activeDocument
    ? {
        isDirty: false,
        ...activeDocument,
      }
    : null;

export const setDefaultSession = (session: Partial<TestSessionState> = {}) => {
  const { activeDocument, ...sessionRest } = session;

  useSessionStore.setState({
    folderContext: null,
    activeDocument: toTestActiveDocumentState(activeDocument),
    activeDocumentGeneration: 0,
    activeDocumentLoadId: 0,
    ...sessionRest,
  });
};

export const setDefaultUI = (ui: Partial<CommandUIState> = {}) => {
  useCommandUIStore.setState({
    aboutOpen: false,
    commandPaletteOpen: false,
    diagnosticsOpen: false,
    helpPage: null,
    keyboardShortcutsOpen: false,
    preferencesOpen: false,
    fullscreen: false,
    zoom: 1,
    pendingSortOrder: null,
    ...ui,
  });
};

export const resetAppStores = () => {
  setDefaultSettings();
  setDefaultRecentItems();
  setDefaultSession();
  setDefaultUI();
  useReleaseNotesStore.setState({
    currentVersion: "",
    lastVersion: "",
    seenVersions: [],
    surface: null,
    version: RELEASE_NOTES_STATE_VERSION,
  });
  useArticleNavigatorStore.getState().reset();
  useFolderSearchStore.getState().reset();
};
