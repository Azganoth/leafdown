import { getCurrentWindow } from "@tauri-apps/api/window";

import { handleUnexpectedError } from "@/lib/errors";

import { useSessionStore } from "../stores/session";
import { keepWindowSession } from "./keptSession";
import { confirmDiscardAllDocumentChanges } from "./unsavedChanges";

export interface WindowCloseRequest {
  /** Set when the window closes while quitting or as the last window. */
  keepsSession: boolean;
}

/**
 * Asks once about the window's unsaved documents before it closes, unless the window closes for
 * good and its unsaved documents are kept for the next launch. `Quit` closes the windows in turn,
 * so a window with something to ask comes forward first; the others close unseen.
 */
export const confirmWindowClose = async ({ keepsSession }: WindowCloseRequest) => {
  if (keepsSession && (await keepWindowSession())) {
    return true;
  }

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
