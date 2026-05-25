import { create } from "zustand";

export interface MarkdownFolderTree {
  name: string;
  path: string;
  children: MarkdownFolderTreeNode[];
}

export interface MarkdownFolderDirectoryNode {
  kind: "directory";
  name: string;
  path: string;
  children: MarkdownFolderTreeNode[];
}

export interface MarkdownFolderFileNode {
  kind: "file";
  name: string;
  path: string;
}

export type MarkdownFolderTreeNode = MarkdownFolderDirectoryNode | MarkdownFolderFileNode;

export interface FolderContextState {
  path: string;
  tree: MarkdownFolderTree;
  isEmpty: boolean;
}

export type FolderContextStatus = "available" | "empty";

export const getFolderContextStatus = (folderContext: FolderContextState): FolderContextStatus =>
  folderContext.isEmpty ? "empty" : "available";

export type LineEnding = "crlf" | "lf";

export interface FileMetadataSnapshot {
  sizeBytes: number;
  modifiedAtUnixMs: number;
}

export interface SavedDocumentState {
  status: "saved";
  path: string;
  content: string;
  isDirty: boolean;
  lineEnding: LineEnding | null;
  metadata: FileMetadataSnapshot;
}

export interface UntitledDocumentState {
  status: "untitled";
  id: string;
  content: string;
  isDirty: boolean;
  lineEnding: LineEnding;
}

export type ActiveDocumentState = SavedDocumentState | UntitledDocumentState;

export const toSavedDocument = (
  doc: Omit<SavedDocumentState, "status" | "isDirty"> &
    Partial<Pick<SavedDocumentState, "isDirty">>,
): SavedDocumentState => ({
  status: "saved",
  isDirty: false,
  ...doc,
});

export const toUntitledDocument = (
  doc: Omit<UntitledDocumentState, "status" | "isDirty"> &
    Partial<Pick<UntitledDocumentState, "isDirty">>,
): UntitledDocumentState => ({
  status: "untitled",
  isDirty: false,
  ...doc,
});

export const getActiveDocumentKey = (document: ActiveDocumentState) =>
  document.status === "saved" ? document.path : document.id;

export interface SessionState {
  folderContext: FolderContextState | null;
  activeDocument: ActiveDocumentState | null;
}

export type SessionShellMode = "document" | "folder-only" | "welcome";

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

export const getSessionShellMode = (state: SessionState): SessionShellMode => {
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

      return {
        activeDocument: {
          ...activeDocument,
          content,
        },
      };
    }),
  setActiveDocumentLineEnding: (documentKey, lineEnding) =>
    set((state) => {
      const { activeDocument } = state;

      if (!activeDocument || getActiveDocumentKey(activeDocument) !== documentKey) {
        return state;
      }

      return {
        activeDocument: {
          ...activeDocument,
          lineEnding,
        },
      };
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

      return {
        activeDocument: {
          ...activeDocument,
          isDirty: true,
        },
      };
    }),
  setDocumentSession: (folderContext, activeDocument) => set({ folderContext, activeDocument }),
  reset: () => set(initialSessionState),
}));
