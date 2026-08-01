import "@/App.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { setTheme as tauriSetTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { lazy, Suspense, useEffect, useState } from "react";

import { Shell } from "@/components/layout/Shell";
import { UnexpectedErrorBoundary } from "@/components/layout/UnexpectedErrorBoundary";
import { Toaster } from "@/components/ui/Sonner";
import { writeDiagnosticOperationLifecycle } from "@/features/diagnostics";
import {
  recentItemsStoreTauriHandler,
  settingsStoreTauriHandler,
  useSettingsStore,
  type SettingsState,
} from "@/features/preferences";
import { confirmDiscardActiveDocumentChanges } from "@/features/session";
import { handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { DisposableStore } from "@/lib/lifecycle";
import { useTauriEvent } from "@/lib/tauriEvent";

const DeveloperTools = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import("@/components/layout/DeveloperTools");

      return { default: module.DeveloperTools };
    })
  : null;

const setDarkAppearance = (isDark: boolean) => {
  window.document.documentElement.classList.toggle("dark", isDark);
};

const updateTheme = async (theme: SettingsState["theme"]) => {
  await tauriSetTheme(theme === "system" ? null : theme);

  setDarkAppearance(
    theme === "system" ? (await getCurrentWindow().theme()) === "dark" : theme === "dark",
  );
};

const WINDOW_CLOSE_REQUESTED_EVENT = "leafdown://window-close-requested";
const WINDOW_CLOSE_DECLINED_EVENT = "leafdown://window-close-declined";

export function App() {
  const [simulatedRenderFailureId, setSimulatedRenderFailureId] = useState(0);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await Promise.all([
          settingsStoreTauriHandler.start(),
          recentItemsStoreTauriHandler.start(),
        ]);

        await updateTheme(useSettingsStore.getState().theme);
      } finally {
        // A window that is never shown has no chrome, focus, or taskbar entry, so it cannot even
        // be asked to close. Showing it regardless keeps a failed startup reportable and exitable.
        await getCurrentWindow()
          .show()
          .catch((error) => handleUnexpectedError(error, "showWindow"));
      }
    };

    void initializeApp().catch((error) =>
      notifyOperationFailure("Could not load preferences.", error, "initializeApp"),
    );
  }, []);

  useTauriEvent<void>(
    WINDOW_CLOSE_REQUESTED_EVENT,
    async () => {
      const appWindow = getCurrentWindow();

      // The backend keeps a close request pending until the window is destroyed or the request is
      // declined, and lets the next request through while one is still pending. Answering only
      // deliberate decisions is what makes that fallback reach a close handler that keeps failing.
      if (!(await confirmDiscardActiveDocumentChanges())) {
        await appWindow.emit(WINDOW_CLOSE_DECLINED_EVENT);
        return;
      }

      await writeDiagnosticOperationLifecycle({
        feature: "app",
        operation: "window",
        phase: "closing",
      });
      await appWindow.destroy();
    },
    "windowCloseRequested",
  );

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

  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    const disposables = new DisposableStore();

    void updateTheme(theme).catch((error) => handleUnexpectedError(error, "updateTheme"));

    if (theme === "system") {
      void getCurrentWindow()
        .onThemeChanged(({ payload }) => setDarkAppearance(payload === "dark"))
        .then((unlisten) => {
          disposables.add(unlisten);
        })
        .catch((error) => handleUnexpectedError(error, "onThemeChanged"));
    }

    return () => {
      disposables.dispose();
    };
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
