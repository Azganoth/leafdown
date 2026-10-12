import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const TAKE_LAUNCH_DOCUMENT_PATHS_COMMAND = "take_launch_document_paths";

export const LAUNCH_DOCUMENTS_EVENT = "leafdown://launch-documents";

export const takeLaunchDocumentPaths = () => invoke<string[]>(TAKE_LAUNCH_DOCUMENT_PATHS_COMMAND);

/** Calls `handler` when a later launch routes documents to this window for it to take. */
export const listenForLaunchDocuments = (handler: () => void) =>
  getCurrentWindow().listen<void>(LAUNCH_DOCUMENTS_EVENT, handler);
