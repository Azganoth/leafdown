import { create } from "zustand";

export interface FolderContextState {
  status: "available";
}

export interface ActiveDocumentState {
  status: "active";
}

export interface SessionState {
  folderContext: FolderContextState | null;
  activeDocument: ActiveDocumentState | null;
}

export type SessionShellMode = "document" | "folder-only" | "welcome";

export interface SessionStore extends SessionState {
  setFolderContext: (folderContext: FolderContextState | null) => void;
  setActiveDocument: (activeDocument: ActiveDocumentState | null) => void;
  reset: () => void;
}

const initialSessionState: SessionState = {
  folderContext: null,
  activeDocument: null,
};

export const getSessionShellMode = (state: SessionState): SessionShellMode => {
  if (state.activeDocument) {
    return "document";
  }

  return state.folderContext ? "folder-only" : "welcome";
};

export const useSessionStore = create<SessionStore>()((set) => ({
  ...initialSessionState,

  setFolderContext: (folderContext) => set({ folderContext }),
  setActiveDocument: (activeDocument) => set({ activeDocument }),
  reset: () => set(initialSessionState),
}));
