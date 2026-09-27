import { create } from "zustand";

import {
  isSameEncoding,
  matchesActiveDocumentKey,
  type ActiveDocumentState,
  type DocumentEncoding,
  type LineEnding,
} from "@/features/document";
import type { FolderContextState } from "@/features/folder-context";

export interface SessionState {
  folderContext: FolderContextState | null;
  activeDocument: ActiveDocumentState | null;
  activeDocumentGeneration: number;
  /** Changes when the active document's text is replaced from disk without its key changing. */
  activeDocumentLoadId: number;
}

export type SessionMode = "document" | "folder-only" | "welcome";

export interface ActiveDocumentUpdateOptions {
  reload?: boolean;
}

export interface SessionStore extends SessionState {
  setFolderContext: (folderContext: FolderContextState | null) => void;
  setFolderOnlySession: (folderContext: FolderContextState) => void;
  setActiveDocument: (
    activeDocument: ActiveDocumentState | null,
    options?: ActiveDocumentUpdateOptions,
  ) => void;
  setActiveDocumentContent: (documentKey: string, content: string) => void;
  setActiveDocumentLineEnding: (documentKey: string, lineEnding: LineEnding) => void;
  setActiveDocumentEncoding: (documentKey: string, encoding: DocumentEncoding) => void;
  markActiveDocumentDirty: (documentKey: string) => void;
  setActiveDocumentSession: (
    folderContext: FolderContextState | null,
    activeDocument: ActiveDocumentState,
    options?: ActiveDocumentUpdateOptions,
  ) => void;
  reset: () => void;
}

const INITIAL_SESSION_STATE: SessionState = {
  folderContext: null,
  activeDocument: null,
  activeDocumentGeneration: 0,
  activeDocumentLoadId: 0,
};

export const getSessionMode = (
  state: Pick<SessionState, "activeDocument" | "folderContext">,
): SessionMode =>
  state.activeDocument ? "document" : state.folderContext ? "folder-only" : "welcome";

export const useSessionStore = create<SessionStore>()((set) => ({
  ...INITIAL_SESSION_STATE,

  setFolderContext: (folderContext) => set({ folderContext }),
  setFolderOnlySession: (folderContext) =>
    set((state) => ({
      activeDocument: null,
      activeDocumentGeneration: state.activeDocumentGeneration + 1,
      folderContext,
    })),
  setActiveDocument: (activeDocument, { reload = false } = {}) =>
    set((state) => ({
      activeDocument,
      activeDocumentGeneration: state.activeDocumentGeneration + 1,
      activeDocumentLoadId: state.activeDocumentLoadId + (reload ? 1 : 0),
    })),
  setActiveDocumentContent: (documentKey, content) =>
    set((state) =>
      updateActiveDocumentByKey(state, documentKey, (activeDocument) => ({
        ...activeDocument,
        content,
      })),
    ),
  setActiveDocumentLineEnding: (documentKey, lineEnding) =>
    set((state) =>
      updateActiveDocumentByKey(state, documentKey, (activeDocument) =>
        activeDocument.lineEnding === lineEnding
          ? activeDocument
          : {
              ...activeDocument,
              isDirty: true,
              lineEnding,
            },
      ),
    ),
  setActiveDocumentEncoding: (documentKey, encoding) =>
    set((state) =>
      updateActiveDocumentByKey(state, documentKey, (activeDocument) =>
        isSameEncoding(activeDocument.encoding, encoding)
          ? activeDocument
          : {
              ...activeDocument,
              isDirty: true,
              encoding,
            },
      ),
    ),
  markActiveDocumentDirty: (documentKey) =>
    set((state) =>
      updateActiveDocumentByKey(state, documentKey, (activeDocument) =>
        activeDocument.isDirty ? activeDocument : { ...activeDocument, isDirty: true },
      ),
    ),
  setActiveDocumentSession: (folderContext, activeDocument, { reload = false } = {}) =>
    set((state) => ({
      folderContext,
      activeDocument,
      activeDocumentGeneration: state.activeDocumentGeneration + 1,
      activeDocumentLoadId: state.activeDocumentLoadId + (reload ? 1 : 0),
    })),
  reset: () =>
    set((state) => ({
      ...INITIAL_SESSION_STATE,
      activeDocumentGeneration: state.activeDocumentGeneration + 1,
    })),
}));

const updateActiveDocumentByKey = (
  state: SessionStore,
  documentKey: string,
  update: (activeDocument: ActiveDocumentState) => ActiveDocumentState,
) => {
  const { activeDocument } = state;

  if (!activeDocument || !matchesActiveDocumentKey(activeDocument, documentKey)) {
    return state;
  }

  const nextActiveDocument = update(activeDocument);

  return nextActiveDocument === activeDocument ? state : { activeDocument: nextActiveDocument };
};
