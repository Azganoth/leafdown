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
  status: "available" | "empty";
  path: string;
  tree: MarkdownFolderTree;
}

export type LineEnding = "crlf" | "lf";

export interface FileMetadataSnapshot {
  sizeBytes: number;
  modifiedAtUnixMs: number;
}

export interface SavedDocumentState {
  status: "saved";
  path: string;
  content: string;
  lineEnding: LineEnding | null;
  metadata: FileMetadataSnapshot;
}

export type ActiveDocumentState = SavedDocumentState;

export interface SessionState {
  folderContext: FolderContextState | null;
  activeDocument: ActiveDocumentState | null;
}

export type SessionShellMode = "document" | "folder-only" | "welcome";

export interface SessionStore extends SessionState {
  setFolderContext: (folderContext: FolderContextState | null) => void;
  setFolderSession: (folderContext: FolderContextState) => void;
  setActiveDocument: (activeDocument: ActiveDocumentState | null) => void;
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
  setDocumentSession: (folderContext, activeDocument) => set({ folderContext, activeDocument }),
  reset: () => set(initialSessionState),
}));
