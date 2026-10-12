import { getCurrentWindow } from "@tauri-apps/api/window";

import { handleUnexpectedError } from "@/lib/errors";

import { useSessionStore } from "../stores/session";
import { confirmDiscardAllDocumentChanges } from "./unsavedChanges";

/**
 * Asks once about the window's unsaved documents before it closes. `Quit` closes the windows in
 * turn, so a window with something to ask comes forward first; the others close unseen.
 */
export const confirmWindowClose = async () => {
  if (useSessionStore.getState().tabs.some(({ document }) => document.isDirty)) {
    await bringWindowForward();
  }

  return confirmDiscardAllDocumentChanges();
};

const bringWindowForward = async () => {
  const appWindow = getCurrentWindow();

  try {
    await appWindow.unminimize();
    await appWindow.setFocus();
  } catch (error) {
    handleUnexpectedError(error, "bringWindowForward");
  }
};
