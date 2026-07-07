import "@/App.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { setTheme as tauriSetTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy, Suspense, useEffect, useState } from "react";

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

const DeveloperTools = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("@/components/layout/DeveloperTools");

      return { default: module.DeveloperTools };
    })
  : null;

const updateTheme = async (theme: SettingsState["theme"]) => {
  await tauriSetTheme(theme === "system" ? null : theme);

  const isDark =
    theme === "system" ? (await getCurrentWindow().theme()) === "dark" : theme === "dark";
  window.document.documentElement.classList.toggle("dark", isDark);
};

export function App() {
  const [simulatedRenderFailureId, setSimulatedRenderFailureId] = useState(0);

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
        {simulatedRenderFailureId > 0 && <DeveloperRenderFailure key={simulatedRenderFailureId} />}
      </UnexpectedErrorBoundary>
      {DeveloperTools && (
        <Suspense fallback={null}>
          <DeveloperTools
            onSimulateRenderFailure={() =>
              setSimulatedRenderFailureId((failureId) => failureId + 1)
            }
          />
        </Suspense>
      )}
      <Toaster theme={theme} />
    </div>
  );
}

function DeveloperRenderFailure(): never {
  throw new Error("Developer tools simulated document surface render failure.");
}
