import "@/App.css";
import { SessionShell } from "@/features/shell/components/SessionShell";
import { TitleBar } from "@/features/shell/components/TitleBar";
import { Toaster } from "@/components/ui/Sonner";
import { confirmActiveDocumentTransition } from "@/lib/dirtyDocumentTransitions";
import { settingsStoreTauriHandler, useSettingsStore, type SettingsState } from "@/stores/settings";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { setTheme as tauriSetTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

const windowCloseRequestedEvent = "leafdown://window-close-requested";

const updateTheme = async (theme: SettingsState["theme"]) => {
  await tauriSetTheme(theme === "system" ? null : theme);

  const isDark =
    theme === "system" ? (await getCurrentWindow().theme()) === "dark" : theme === "dark";
  window.document.documentElement.classList.toggle("dark", isDark);
};

function App() {
  useEffect(() => {
    const initializeApp = async () => {
      await settingsStoreTauriHandler.start();

      await useSettingsStore.getState().init();
      await updateTheme(useSettingsStore.getState().theme);

      await getCurrentWindow().show();
    };

    void initializeApp().catch(console.error);
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
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void appWindow
      .listen(windowCloseRequestedEvent, async () => {
        if (await confirmActiveDocumentTransition()) {
          await appWindow.destroy();
        }
      })
      .then((closeUnlisten) => {
        if (disposed) {
          closeUnlisten();
          return;
        }

        unlisten = closeUnlisten;
      })
      .catch(console.error);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    void updateTheme(theme);
  }, [theme]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TitleBar />
      <SessionShell />
      <Toaster />
    </div>
  );
}

export { App };
