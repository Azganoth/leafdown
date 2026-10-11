import { invoke } from "@tauri-apps/api/core";

export const WINDOW_CLOSE_REQUESTED_EVENT = "leafdown://window-close-requested";
export const DECLINE_WINDOW_CLOSE_COMMAND = "decline_window_close";

export const declineWindowClose = () => invoke<void>(DECLINE_WINDOW_CLOSE_COMMAND);
