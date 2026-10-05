import { invoke } from "@tauri-apps/api/core";

export const TAKE_LAUNCH_DOCUMENT_PATH_COMMAND = "take_launch_document_path";

export const takeLaunchDocumentPath = () =>
  invoke<string | null>(TAKE_LAUNCH_DOCUMENT_PATH_COMMAND);
