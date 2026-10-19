import { invoke } from "@tauri-apps/api/core";

import { useNamedFoldersStore } from "../stores/namedFolders";

export const SET_WINDOW_DOCUMENTS_COMMAND = "set_window_documents";
export const CLAIM_WINDOW_DOCUMENT_COMMAND = "claim_window_document";
export const NOTIFY_DOCUMENTS_MOVED_COMMAND = "notify_documents_moved";
export const NOTIFY_DOCUMENTS_REMOVED_COMMAND = "notify_documents_removed";

export const WINDOW_DOCUMENTS_CHANGED_EVENT = "leafdown://window-documents-changed";
export const ACTIVATE_DOCUMENT_EVENT = "leafdown://activate-document";
export const DOCUMENTS_MOVED_EVENT = "leafdown://documents-moved";
export const DOCUMENTS_REMOVED_EVENT = "leafdown://documents-removed";

export interface WindowDocument {
  path: string;
  unsaved: boolean;
}

export interface WindowDocumentsSnapshot {
  revision: number;
  windows: { windowLabel: string; documents: WindowDocument[] }[];
}

export type ClaimWindowDocumentResult =
  | { kind: "claimed" }
  | { kind: "openElsewhere" }
  | { kind: "ownedByContext"; contextId: string };

export interface SetWindowDocumentsArgs {
  documents: WindowDocument[];
  contextId?: string | null;
}

export interface ClaimWindowDocumentArgs {
  path: string;
  activate: boolean;
}

export interface DocumentsMovedPayload {
  fromPath: string;
  toPath: string;
}

export interface DocumentPathPayload {
  path: string;
}

export const setWindowDocuments = (documents: WindowDocument[]) =>
  invoke<void>(SET_WINDOW_DOCUMENTS_COMMAND, {
    documents,
    ...(useNamedFoldersStore.getState().activeId && {
      contextId: useNamedFoldersStore.getState().activeId,
    }),
  } satisfies SetWindowDocumentsArgs);

export const claimWindowDocument = (path: string, activate: boolean) =>
  invoke<ClaimWindowDocumentResult>(CLAIM_WINDOW_DOCUMENT_COMMAND, {
    path,
    activate,
  } satisfies ClaimWindowDocumentArgs);

export const notifyDocumentsMoved = (fromPath: string, toPath: string) =>
  invoke<void>(NOTIFY_DOCUMENTS_MOVED_COMMAND, {
    fromPath,
    toPath,
  } satisfies DocumentsMovedPayload);

export const notifyDocumentsRemoved = (path: string) =>
  invoke<void>(NOTIFY_DOCUMENTS_REMOVED_COMMAND, { path } satisfies DocumentPathPayload);
