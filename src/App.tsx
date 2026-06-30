import "@/App.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { setTheme as tauriSetTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { Shell } from "@/components/layout/Shell";
import { UnexpectedErrorBoundary } from "@/components/layout/UnexpectedErrorBoundary";
import { Toaster } from "@/components/ui/Sonner";
import {
  recentItemsStoreTauriHandler,
  settingsStoreTauriHandler,
  useSettingsStore,
  type SettingsState,
} from "@/features/preferences";
import { confirmDiscardActiveDocumentChanges } from "@/features/session";
import { handleUnexpectedError } from "@/lib/errors";
import { DisposableStore } from "@/lib/lifecycle";

const updateTheme = async (theme: SettingsState["theme"]) => {
  await tauriSetTheme(theme === "system" ? null : theme);

  const isDark =
    theme === "system" ? (await getCurrentWindow().theme()) === "dark" : theme === "dark";
  window.document.documentElement.classList.toggle("dark", isDark);
};

export function App() {
  useEffect(() => {
    const initializeApp = async () => {
      await Promise.all([settingsStoreTauriHandler.start(), recentItemsStoreTauriHandler.start()]);

      await updateTheme(useSettingsStore.getState().theme);

      await getCurrentWindow().show();
    };

    void initializeApp().catch((error) => handleUnexpectedError(error, "initializeApp"));
  }, []);

  useEffect(() => {
    const preventDropNavigation = (event: DragEvent) => {
      event.preventDefault();
    };

    window.addEventListener("dragover", preventDropNavigation);
    window.addEventListener("drop", preventDropNavigation);

    return () => {
      window.removeEventListener("dragover", preventDropNavigation);
      window.removeEventListener("drop", preventDropNavigation);
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const listenerDisposables = new DisposableStore();

    const setupCloseListener = async () => {
      try {
        const closeUnlisten = await appWindow.listen(
          "leafdown://window-close-requested",
          async () => {
            if (await confirmDiscardActiveDocumentChanges()) {
              await appWindow.destroy();
            }
          },
        );
        listenerDisposables.add(closeUnlisten);
      } catch (error) {
        handleUnexpectedError(error, "setupCloseListener");
      }
    };

    void setupCloseListener();

    return () => {
      listenerDisposables.dispose();
    };
  }, []);

  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    void updateTheme(theme).catch((error) => handleUnexpectedError(error, "updateTheme"));
  }, [theme]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <UnexpectedErrorBoundary>
        <Shell />
      </UnexpectedErrorBoundary>
      <Toaster theme={theme} />
    </div>
  );
}
