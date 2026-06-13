import { create } from "zustand";

import {
  getActiveDocumentKey,
  type ActiveDocumentState,
  type LineEnding,
} from "@/features/document";
import type { FolderContextState } from "@/features/folder-context";

export interface SessionState {
  folderContext: FolderContextState | null;
  activeDocument: ActiveDocumentState | null;
}

export type AppShellMode = "document" | "folder-only" | "welcome";

export interface SessionStore extends SessionState {
  setFolderContext: (folderContext: FolderContextState | null) => void;
  setFolderSession: (folderContext: FolderContextState) => void;
  setActiveDocument: (activeDocument: ActiveDocumentState | null) => void;
  setActiveDocumentContent: (documentKey: string, content: string) => void;
  setActiveDocumentLineEnding: (documentKey: string, lineEnding: LineEnding) => void;
  markActiveDocumentDirty: (documentKey: string) => void;
  setDocumentSession: (
    folderContext: FolderContextState | null,
    activeDocument: ActiveDocumentState,
  ) => void;
  reset: () => void;
}

const initialSessionState: SessionState = {
  folderContext: null,
  activeDocument: null,
};

export const getAppShellMode = (state: SessionState): AppShellMode => {
  if (state.activeDocument) {
    return "document";
  }

  return state.folderContext ? "folder-only" : "welcome";
};

export const useSessionStore = create<SessionStore>()((set) => ({
  ...initialSessionState,

  setFolderContext: (folderContext) => set({ folderContext }),
  setFolderSession: (folderContext) => set({ activeDocument: null, folderContext }),
  setActiveDocument: (activeDocument) => set({ activeDocument }),
  setActiveDocumentContent: (documentKey, content) =>
    set((state) => {
      const { activeDocument } = state;

      if (!activeDocument || getActiveDocumentKey(activeDocument) !== documentKey) {
        return state;
      }

      return { activeDocument: { ...activeDocument, content } };
    }),
  setActiveDocumentLineEnding: (documentKey, lineEnding) =>
    set((state) => {
      const { activeDocument } = state;

      if (!activeDocument || getActiveDocumentKey(activeDocument) !== documentKey) {
        return state;
      }

      return { activeDocument: { ...activeDocument, lineEnding } };
    }),
  markActiveDocumentDirty: (documentKey) =>
    set((state) => {
      const { activeDocument } = state;

      if (
        !activeDocument ||
        activeDocument.isDirty ||
        getActiveDocumentKey(activeDocument) !== documentKey
      ) {
        return state;
      }

      return { activeDocument: { ...activeDocument, isDirty: true } };
    }),
  setDocumentSession: (folderContext, activeDocument) => set({ folderContext, activeDocument }),
  reset: () => set(initialSessionState),
}));
