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
import { useNamedFoldersStore } from "@/features/session/stores/namedFolders";
import { useOtherWindowDocumentsStore } from "@/features/session/stores/otherWindowDocuments";
// Deep import by design: `@/features/session` re-exports `documentEditorBridge`, and the
// beforeEach in ../setup/common.ts loads this module for every test file.
import {
  useSessionStore,
  type DocumentReplaceOptions,
  type DocumentTab,
  type SessionState,
} from "@/features/session/stores/session";

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

interface TestSessionState extends Pick<SessionState, "folderContext" | "folderContextLoad"> {
  /** Opens one tab holding this document. */
  activeDocument: TestActiveDocumentState | null;
  /** Opens a tab for each document instead, in this order. */
  documents: TestActiveDocumentState[];
  /** The position of the active tab among `documents`. */
  activeIndex: number;
  /** The position of the preview tab among `documents`, when one is a preview. */
  previewIndex: number;
}

const toTestActiveDocumentState = (
  activeDocument: TestActiveDocumentState,
): ActiveDocumentState => ({
  isDirty: false,
  ...activeDocument,
});

export const setDefaultSession = (session: Partial<TestSessionState> = {}) => {
  const { activeDocument, activeIndex = 0, documents, previewIndex, ...sessionRest } = session;
  const tabs: DocumentTab[] = (documents ?? (activeDocument ? [activeDocument] : [])).map(
    (document, index) => ({
      id: `test-tab:${index + 1}`,
      document: toTestActiveDocumentState(document),
      generation: 0,
      loadId: 0,
      viewState: null,
      preview: index === previewIndex,
    }),
  );
  const activeTab = tabs[activeIndex] ?? null;

  useSessionStore.setState({
    folderContext: null,
    folderContextLoad: null,
    tabs,
    activeTabId: activeTab?.id ?? null,
    activeDocument: activeTab?.document ?? null,
    ...sessionRest,
  });
};

/** Replaces the active tab's document, as a save, a reload, or a rename does. */
export const replaceActiveDocument = (
  document: TestActiveDocumentState,
  options?: DocumentReplaceOptions,
) => {
  const { activeTabId, replaceTabDocument } = useSessionStore.getState();

  if (activeTabId) {
    replaceTabDocument(activeTabId, toTestActiveDocumentState(document), options);
  }
};

export const closeActiveTab = () => {
  const { activeTabId, closeTabs } = useSessionStore.getState();

  if (activeTabId) {
    closeTabs([activeTabId]);
  }
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
  useNamedFoldersStore.setState(useNamedFoldersStore.getInitialState());
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
  useOtherWindowDocumentsStore.setState(useOtherWindowDocumentsStore.getInitialState());
};
