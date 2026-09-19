import "@/app.css";
import { setTheme as tauriSetTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { Shell } from "@/components/layout/shell";
import { UnexpectedErrorBoundary } from "@/components/layout/unexpected-error-boundary";
import { Toaster } from "@/components/ui/toast";
import { writeDiagnosticOperationLifecycle } from "@/features/diagnostics";
import {
  recentItemsStoreTauriHandler,
  settingsStoreTauriHandler,
  useSettingsStore,
  type SettingsState,
} from "@/features/preferences";
import { confirmDiscardActiveDocumentChanges, useDroppedPathListener } from "@/features/session";
import { handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { DisposableStore } from "@/lib/lifecycle";
import { useTauriEvent } from "@/lib/tauriEvent";

const TOAST_TIMEOUT_MS = import.meta.env.MODE === "desktop-e2e" ? 0 : undefined;

const setDarkAppearance = (isDark: boolean) => {
  window.document.documentElement.classList.toggle("dark", isDark);
};

const setAccentColor = (accentColor: SettingsState["accentColor"]) => {
  window.document.documentElement.dataset.accentColor = accentColor;
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
  useDroppedPathListener();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await Promise.all([
          settingsStoreTauriHandler.start(),
          recentItemsStoreTauriHandler.start(),
        ]);

        await updateTheme(useSettingsStore.getState().theme);
      } finally {
        // A hidden window has no chrome, focus, or taskbar entry, so it cannot be asked to close.
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

      // The backend closes on the next request while one is pending, so only a deliberate
      // decision answers it: a handler that keeps failing must stay silent to stay closable.
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
  const accentColor = useSettingsStore((state) => state.accentColor);

  useEffect(() => {
    setAccentColor(accentColor);
  }, [accentColor]);

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
      </UnexpectedErrorBoundary>
      <Toaster timeout={TOAST_TIMEOUT_MS} />
    </div>
  );
}
