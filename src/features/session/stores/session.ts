import { create } from "zustand";

import {
  getActiveDocumentKey,
  isSameEncoding,
  matchesActiveDocumentKey,
  type ActiveDocumentState,
  type DocumentEncoding,
  type ExternalFileChange,
  type FileMetadataSnapshot,
  type LineEnding,
} from "@/features/document";
import type { EditorViewState } from "@/features/editor";
import type { FolderContextState } from "@/features/folder-context";
import { isSamePath } from "@/lib/path";

/** One open document in the window, with the editor state that outlives switching away from it. */
export interface DocumentTab {
  id: string;
  document: ActiveDocumentState;
  /** Changes whenever the document is replaced, so a decision about an older version is dropped. */
  generation: number;
  /** Changes when the document's text is replaced from disk without its key changing. */
  loadId: number;
  /** The caret and focus the editor restores when a reload remounts it. */
  viewState: EditorViewState | null;
}

export interface SessionState {
  folderContext: FolderContextState | null;
  /** The folder a file open made the folder context while its scan has not finished. */
  folderContextLoad: FolderContextLoad | null;
  /** Open documents in tab order. */
  tabs: DocumentTab[];
  activeTabId: string | null;
  /** The active tab's document, kept beside the tabs for readers that only need it. */
  activeDocument: ActiveDocumentState | null;
}

export interface FolderContextLoad {
  id: number;
  path: string;
}

export type SessionMode = "document" | "folder-only" | "welcome";

export interface DocumentReplaceOptions {
  reload?: boolean;
  viewState?: EditorViewState | null;
}

export interface DocumentFileState {
  metadata: FileMetadataSnapshot;
  externalChange: ExternalFileChange | null;
}

export interface SessionStore extends SessionState {
  setFolderContext: (folderContext: FolderContextState | null) => void;
  /** Adds a tab after the active one and activates it, optionally replacing the folder context. */
  openTab: (
    document: ActiveDocumentState,
    options?: { folderContext?: FolderContextState },
  ) => DocumentTab;
  openTabWithFolderContextLoad: (
    folderPath: string,
    document: ActiveDocumentState,
  ) => { tab: DocumentTab; folderContextLoad: FolderContextLoad };
  activateTab: (tabId: string) => void;
  /** Closes the tabs, activating the nearest remaining tab when the active one closes. */
  closeTabs: (tabIds: readonly string[]) => void;
  replaceTabDocument: (
    tabId: string,
    document: ActiveDocumentState,
    options?: DocumentReplaceOptions & { folderContext?: FolderContextState },
  ) => void;
  setDocumentContent: (documentKey: string, content: string) => void;
  setDocumentLineEnding: (documentKey: string, lineEnding: LineEnding) => void;
  setDocumentEncoding: (documentKey: string, encoding: DocumentEncoding) => void;
  markDocumentDirty: (documentKey: string) => void;
  /** Records what the file on disk holds without replacing the document or invalidating its decisions. */
  setDocumentFileState: (documentKey: string, fileState: DocumentFileState) => void;
  /** Applies a finished scan unless another folder context or load has replaced it. */
  finishFolderContextLoad: (loadId: number, folderContext: FolderContextState) => boolean;
  abandonFolderContextLoad: (loadId: number) => boolean;
  reset: () => void;
}

const INITIAL_SESSION_STATE: SessionState = {
  folderContext: null,
  folderContextLoad: null,
  tabs: [],
  activeTabId: null,
  activeDocument: null,
};

export const getSessionMode = (
  state: Pick<SessionState, "activeDocument" | "folderContext">,
): SessionMode =>
  state.activeDocument ? "document" : state.folderContext ? "folder-only" : "welcome";

export const getSessionFolderPath = (
  state: Pick<SessionState, "folderContext" | "folderContextLoad">,
) => state.folderContext?.path ?? state.folderContextLoad?.path ?? null;

export const getActiveTab = (state: Pick<SessionState, "tabs" | "activeTabId">) =>
  state.tabs.find((tab) => tab.id === state.activeTabId) ?? null;

export const findTab = (state: Pick<SessionState, "tabs">, tabId: string) =>
  state.tabs.find((tab) => tab.id === tabId) ?? null;

export const findTabByDocumentKey = (state: Pick<SessionState, "tabs">, documentKey: string) =>
  state.tabs.find((tab) => matchesActiveDocumentKey(tab.document, documentKey)) ?? null;

export const findTabByPath = (state: Pick<SessionState, "tabs">, path: string) =>
  state.tabs.find(
    (tab) => tab.document.status === "saved" && isSamePath(tab.document.path, path),
  ) ?? null;

/** Returns the tab only while it still holds the document version a decision was made about. */
export const findCurrentTab = (
  state: Pick<SessionState, "tabs">,
  tabId: string,
  generation: number,
) => {
  const tab = findTab(state, tabId);

  return tab?.generation === generation ? tab : null;
};

export const getTabDocumentKey = (tab: DocumentTab) => getActiveDocumentKey(tab.document);

let nextTabId = 0;
let nextGeneration = 0;
let nextFolderContextLoadId = 0;

const createTab = (document: ActiveDocumentState): DocumentTab => {
  nextTabId += 1;
  nextGeneration += 1;

  return {
    id: `tab:${nextTabId}`,
    document,
    generation: nextGeneration,
    loadId: 0,
    viewState: null,
  };
};

const withTabs = (
  tabs: DocumentTab[],
  activeTabId: string | null,
): Pick<SessionState, "tabs" | "activeTabId" | "activeDocument"> => ({
  tabs,
  activeTabId,
  activeDocument: tabs.find((tab) => tab.id === activeTabId)?.document ?? null,
});

const insertAfterActive = (state: SessionState, tab: DocumentTab) => {
  const activeIndex = state.tabs.findIndex((candidate) => candidate.id === state.activeTabId);
  const tabs = [...state.tabs];

  tabs.splice(activeIndex === -1 ? tabs.length : activeIndex + 1, 0, tab);

  return withTabs(tabs, tab.id);
};

export const useSessionStore = create<SessionStore>()((set, get) => ({
  ...INITIAL_SESSION_STATE,

  setFolderContext: (folderContext) => set({ folderContext, folderContextLoad: null }),
  openTab: (document, options) => {
    const tab = createTab(document);

    set((state) => ({
      ...insertAfterActive(state, tab),
      ...(options?.folderContext && {
        folderContext: options.folderContext,
        folderContextLoad: null,
      }),
    }));

    return tab;
  },
  openTabWithFolderContextLoad: (folderPath, document) => {
    const tab = createTab(document);

    nextFolderContextLoadId += 1;
    const folderContextLoad = { id: nextFolderContextLoadId, path: folderPath };

    set((state) => ({
      ...insertAfterActive(state, tab),
      folderContext: null,
      folderContextLoad,
    }));

    return { tab, folderContextLoad };
  },
  activateTab: (tabId) =>
    set((state) =>
      state.activeTabId === tabId || !findTab(state, tabId) ? state : withTabs(state.tabs, tabId),
    ),
  closeTabs: (tabIds) =>
    set((state) => {
      const closing = new Set(tabIds);
      const tabs = state.tabs.filter((tab) => !closing.has(tab.id));

      if (tabs.length === state.tabs.length) {
        return state;
      }

      if (!state.activeTabId || !closing.has(state.activeTabId)) {
        return withTabs(tabs, state.activeTabId);
      }

      const activeIndex = state.tabs.findIndex((tab) => tab.id === state.activeTabId);
      const nextActive =
        state.tabs.slice(activeIndex + 1).find((tab) => !closing.has(tab.id)) ??
        state.tabs.slice(0, activeIndex).findLast((tab) => !closing.has(tab.id));

      return withTabs(tabs, nextActive?.id ?? null);
    }),
  replaceTabDocument: (tabId, document, { folderContext, reload = false, viewState = null } = {}) =>
    set((state) => {
      if (!findTab(state, tabId)) {
        return state;
      }

      nextGeneration += 1;
      const tabs = state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              document,
              generation: nextGeneration,
              loadId: tab.loadId + (reload ? 1 : 0),
              viewState: reload ? viewState : null,
            }
          : tab,
      );

      return {
        ...withTabs(tabs, state.activeTabId),
        ...(folderContext && { folderContext, folderContextLoad: null }),
      };
    }),
  setDocumentContent: (documentKey, content) =>
    set((state) =>
      updateDocumentByKey(state, documentKey, (document) => ({
        ...document,
        content,
      })),
    ),
  setDocumentLineEnding: (documentKey, lineEnding) =>
    set((state) =>
      updateDocumentByKey(state, documentKey, (document) =>
        document.lineEnding === lineEnding
          ? document
          : {
              ...document,
              isDirty: true,
              lineEnding,
            },
      ),
    ),
  setDocumentEncoding: (documentKey, encoding) =>
    set((state) =>
      updateDocumentByKey(state, documentKey, (document) =>
        isSameEncoding(document.encoding, encoding)
          ? document
          : {
              ...document,
              isDirty: true,
              encoding,
            },
      ),
    ),
  markDocumentDirty: (documentKey) =>
    set((state) =>
      updateDocumentByKey(state, documentKey, (document) =>
        document.isDirty ? document : { ...document, isDirty: true },
      ),
    ),
  setDocumentFileState: (documentKey, { externalChange, metadata }) =>
    set((state) =>
      updateDocumentByKey(state, documentKey, (document) =>
        document.status !== "saved" ||
        (document.metadata === metadata && document.externalChange === externalChange)
          ? document
          : { ...document, externalChange, metadata },
      ),
    ),
  finishFolderContextLoad: (loadId, folderContext) => {
    if (get().folderContextLoad?.id !== loadId) {
      return false;
    }

    set({ folderContext, folderContextLoad: null });

    return true;
  },
  abandonFolderContextLoad: (loadId) => {
    if (get().folderContextLoad?.id !== loadId) {
      return false;
    }

    set({ folderContextLoad: null });

    return true;
  },
  reset: () => set(INITIAL_SESSION_STATE),
}));

const updateDocumentByKey = (
  state: SessionStore,
  documentKey: string,
  update: (document: ActiveDocumentState) => ActiveDocumentState,
) => {
  const target = findTabByDocumentKey(state, documentKey);

  if (!target) {
    return state;
  }

  const document = update(target.document);

  if (document === target.document) {
    return state;
  }

  return withTabs(
    state.tabs.map((tab) => (tab === target ? { ...tab, document } : tab)),
    state.activeTabId,
  );
};
