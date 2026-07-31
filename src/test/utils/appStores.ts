import { useCommandUIStore, type CommandUIState } from "@/commands/stores/commandUi";
import type {
  ActiveDocumentState,
  SavedDocumentState,
  UntitledDocumentState,
} from "@/features/document";
import { useArticleNavigatorStore } from "@/features/folder-context";
import {
  createDefaultSettingsState,
  RECENT_ITEMS_VERSION,
  SETTINGS_VERSION,
  useRecentItemsStore,
  useSettingsStore,
  type RecentItemsState,
  type SettingsPersistedState,
} from "@/features/preferences";
// Deep import, unlike the feature-root imports above: `@/features/session` re-exports
// `documentEditorBridge`, which reaches `@/features/editor` and loads Milkdown and Shiki.
// Every test file runs the `beforeEach` in ../setup/common.ts that imports this module,
// so going through the feature root makes each of them pay for the editor stack.
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
    ? ({
        isDirty: false,
        ...activeDocument,
      } as ActiveDocumentState)
    : null;

export const setDefaultSession = (session: Partial<TestSessionState> = {}) => {
  const { activeDocument, ...sessionRest } = session;

  useSessionStore.setState({
    folderContext: null,
    activeDocument: toTestActiveDocumentState(activeDocument),
    ...sessionRest,
  });
};

export const setDefaultUI = (ui: Partial<CommandUIState> = {}) => {
  useCommandUIStore.setState({
    aboutOpen: false,
    diagnosticsOpen: false,
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
  useArticleNavigatorStore.getState().reset();
};
