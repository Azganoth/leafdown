import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { handleUnexpectedError } from "@/lib/errors";
import { DisposableStore } from "@/lib/lifecycle";

import { followDocumentNotices } from "../services/documentNotices";
import { ExternalChangeDialogs } from "../services/externalChangeDialogs";

export const useDocumentNotices = () => {
  useEffect(() => {
    const disposables = new DisposableStore();
    disposables.add(followDocumentNotices());
    const dialogs = disposables.add(new ExternalChangeDialogs());
    const appWindow = getCurrentWindow();
    let focusChanged = false;
    void appWindow
      .onFocusChanged(({ payload }) => {
        focusChanged = true;
        dialogs.setFocused(payload);
      })
      .then(async (unlisten) => {
        disposables.add(unlisten);
        const focused = await appWindow.isFocused();
        if (!focusChanged) dialogs.setFocused(focused);
      })
      .catch((error) => handleUnexpectedError(error, "followExternalChangeFocus"));
    return () => disposables.dispose();
  }, []);
};
