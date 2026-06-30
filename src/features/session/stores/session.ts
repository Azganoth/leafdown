import { create } from "zustand";

import {
  matchesActiveDocumentKey,
  type ActiveDocumentState,
  type LineEnding,
} from "@/features/document";
import type { FolderContextState } from "@/features/folder-context";

export interface SessionState {
  folderContext: FolderContextState | null;
  activeDocument: ActiveDocumentState | null;
}

export type SessionMode = "document" | "folder-only" | "welcome";

export interface SessionStore extends SessionState {
  setFolderContext: (folderContext: FolderContextState | null) => void;
  setFolderOnlySession: (folderContext: FolderContextState) => void;
  setActiveDocument: (activeDocument: ActiveDocumentState | null) => void;
  setActiveDocumentContent: (documentKey: string, content: string) => void;
  setActiveDocumentLineEnding: (documentKey: string, lineEnding: LineEnding) => void;
  markActiveDocumentDirty: (documentKey: string) => void;
  setActiveDocumentSession: (
    folderContext: FolderContextState | null,
    activeDocument: ActiveDocumentState,
  ) => void;
  reset: () => void;
}

const INITIAL_SESSION_STATE: SessionState = {
  folderContext: null,
  activeDocument: null,
};

export const getSessionMode = (state: SessionState): SessionMode =>
  state.activeDocument ? "document" : state.folderContext ? "folder-only" : "welcome";

export const useSessionStore = create<SessionStore>()((set) => ({
  ...INITIAL_SESSION_STATE,

  setFolderContext: (folderContext) => set({ folderContext }),
  setFolderOnlySession: (folderContext) => set({ activeDocument: null, folderContext }),
  setActiveDocument: (activeDocument) => set({ activeDocument }),
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
  markActiveDocumentDirty: (documentKey) =>
    set((state) =>
      updateActiveDocumentByKey(state, documentKey, (activeDocument) =>
        activeDocument.isDirty ? activeDocument : { ...activeDocument, isDirty: true },
      ),
    ),
  setActiveDocumentSession: (folderContext, activeDocument) =>
    set({ folderContext, activeDocument }),
  reset: () => set(INITIAL_SESSION_STATE),
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
