import { create } from "zustand";

import {
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

export interface SessionState {
  folderContext: FolderContextState | null;
  activeDocument: ActiveDocumentState | null;
  activeDocumentGeneration: number;
  /** Changes when the active document's text is replaced from disk without its key changing. */
  activeDocumentLoadId: number;
  /** The caret and focus the editor restores when a reload remounts it. */
  activeDocumentViewState: EditorViewState | null;
}

export type SessionMode = "document" | "folder-only" | "welcome";

export interface ActiveDocumentUpdateOptions {
  reload?: boolean;
  viewState?: EditorViewState | null;
}

export interface ActiveDocumentFileState {
  metadata: FileMetadataSnapshot;
  externalChange: ExternalFileChange | null;
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
  /** Records what the file on disk holds without replacing the document or invalidating its decisions. */
  setActiveDocumentFileState: (documentKey: string, fileState: ActiveDocumentFileState) => void;
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
  activeDocumentViewState: null,
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
      activeDocumentViewState: null,
      folderContext,
    })),
  setActiveDocument: (activeDocument, options) =>
    set((state) => ({
      activeDocument,
      activeDocumentGeneration: state.activeDocumentGeneration + 1,
      ...getActiveDocumentLoad(state, options),
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
  setActiveDocumentFileState: (documentKey, { externalChange, metadata }) =>
    set((state) =>
      updateActiveDocumentByKey(state, documentKey, (activeDocument) =>
        activeDocument.status !== "saved" ||
        (activeDocument.metadata === metadata && activeDocument.externalChange === externalChange)
          ? activeDocument
          : { ...activeDocument, externalChange, metadata },
      ),
    ),
  setActiveDocumentSession: (folderContext, activeDocument, options) =>
    set((state) => ({
      folderContext,
      activeDocument,
      activeDocumentGeneration: state.activeDocumentGeneration + 1,
      ...getActiveDocumentLoad(state, options),
    })),
  reset: () =>
    set((state) => ({
      ...INITIAL_SESSION_STATE,
      activeDocumentGeneration: state.activeDocumentGeneration + 1,
    })),
}));

const getActiveDocumentLoad = (
  state: SessionState,
  { reload = false, viewState = null }: ActiveDocumentUpdateOptions = {},
): Pick<SessionState, "activeDocumentLoadId" | "activeDocumentViewState"> => ({
  activeDocumentLoadId: state.activeDocumentLoadId + (reload ? 1 : 0),
  activeDocumentViewState: reload ? viewState : null,
});

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
