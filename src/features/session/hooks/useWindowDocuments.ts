import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { useTauriEvent } from "@/lib/tauriEvent";

import {
  checkDocumentsRemovedElsewhere,
  followDocumentsMovedElsewhere,
  showDocumentOpenedElsewhere,
} from "../services/crossWindowDocuments";
import { WindowDocumentsSync } from "../services/windowDocumentClaims";
import {
  ACTIVATE_DOCUMENT_EVENT,
  DOCUMENTS_MOVED_EVENT,
  DOCUMENTS_REMOVED_EVENT,
  WINDOW_DOCUMENTS_CHANGED_EVENT,
  type DocumentPathPayload,
  type DocumentsMovedPayload,
  type WindowDocumentsSnapshot,
} from "../services/windowDocumentsApi";
import { useOtherWindowDocumentsStore } from "../stores/otherWindowDocuments";

/**
 * Shares this window's saved documents with the other windows, and follows what they report: a
 * document opened elsewhere, a rename, a deletion, and their unsaved changes.
 */
export const useWindowDocuments = () => {
  useEffect(() => {
    const sync = new WindowDocumentsSync();

    return () => {
      sync.dispose();
    };
  }, []);

  useTauriEvent<WindowDocumentsSnapshot>(
    WINDOW_DOCUMENTS_CHANGED_EVENT,
    ({ payload }) => {
      useOtherWindowDocumentsStore.getState().applySnapshot(payload, getCurrentWindow().label);
    },
    "windowDocumentsChanged",
  );
  useTauriEvent<DocumentPathPayload>(
    ACTIVATE_DOCUMENT_EVENT,
    ({ payload }) => {
      showDocumentOpenedElsewhere(payload.path);
    },
    "activateDocument",
  );
  useTauriEvent<DocumentsMovedPayload>(
    DOCUMENTS_MOVED_EVENT,
    ({ payload }) => followDocumentsMovedElsewhere(payload.fromPath, payload.toPath),
    "documentsMoved",
  );
  useTauriEvent<DocumentPathPayload>(
    DOCUMENTS_REMOVED_EVENT,
    ({ payload }) => checkDocumentsRemovedElsewhere(payload.path),
    "documentsRemoved",
  );
};
