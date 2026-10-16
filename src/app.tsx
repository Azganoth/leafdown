import "@/app.css";
import { setTheme as tauriSetTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

import { Shell } from "@/components/layout/shell";
import { UnexpectedErrorBoundary } from "@/components/layout/unexpected-error-boundary";
import { Toaster } from "@/components/ui/toast";
import { writeDiagnosticOperationLifecycle } from "@/features/diagnostics";
import {
  applyPersistedAlwaysOnTop,
  followAlwaysOnTopSetting,
  recentItemsStoreTauriHandler,
  settingsStoreTauriHandler,
  useSettingsStore,
  type SettingsState,
} from "@/features/preferences";
import { initializeReleaseNotes } from "@/features/release-notes";
import {
  confirmWindowClose,
  declineWindowClose,
  DroppedPathOverlay,
  followKeptSession,
  listenForLaunchDocuments,
  openLaunchDocuments,
  restoreKeptWindowSession,
  useDroppedPathListener,
  WINDOW_CLOSE_REQUESTED_EVENT,
  type WindowCloseRequest,
} from "@/features/session";
import { handleUnexpectedError, notifyOperationFailure } from "@/lib/errors";
import { localizer } from "@/lib/i18n";
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

export function App() {
  const droppedPathIndicator = useDroppedPathListener();

  useEffect(() => {
    const disposables = new DisposableStore();

    const initializeApp = async () => {
      try {
        await Promise.all([
          settingsStoreTauriHandler.start(),
          recentItemsStoreTauriHandler.start(),
        ]);

        localizer.setLanguage(useSettingsStore.getState().language);

        await initializeReleaseNotes().catch((error) =>
          notifyOperationFailure(
            localizer.current.t("app.loadReleaseNotesFailed"),
            error,
            "initializeReleaseNotes",
          ),
        );

        await applyPersistedAlwaysOnTop().catch((error) =>
          notifyOperationFailure(
            localizer.current.t("app.restoreAlwaysOnTopFailed"),
            error,
            "applyPersistedAlwaysOnTop",
          ),
        );
        disposables.add(
          followAlwaysOnTopSetting((error) =>
            notifyOperationFailure(
              localizer.current.t("app.applyAlwaysOnTopFailed"),
              error,
              "followAlwaysOnTopSetting",
            ),
          ),
        );
        await updateTheme(useSettingsStore.getState().theme);
      } finally {
        // A hidden window has no chrome, focus, or taskbar entry, so it cannot be asked to close.
        await getCurrentWindow()
          .show()
          .catch((error) => handleUnexpectedError(error, "showWindow"));
      }
    };

    const openRoutedLaunchDocuments = () =>
      openLaunchDocuments().catch((error) => handleUnexpectedError(error, "openLaunchDocuments"));

    // Listening before the first take means a launch routed here later is either taken by it or
    // announced to the listener.
    const followLaunchDocuments = async () => {
      try {
        disposables.add(await listenForLaunchDocuments(() => void openRoutedLaunchDocuments()));
      } finally {
        await openRoutedLaunchDocuments();
      }
    };

    // Restored tabs come before launched documents, which open after them as they would after
    // tabs opened by hand.
    const restoreKeptSession = async () => {
      try {
        await restoreKeptWindowSession();
      } catch (error) {
        notifyOperationFailure(
          localizer.current.t("app.restoreSessionFailed"),
          error,
          "restoreKeptWindowSession",
        );
      } finally {
        disposables.add(followKeptSession());
      }
    };

    void initializeApp()
      .catch((error) =>
        notifyOperationFailure(
          localizer.current.t("app.loadPreferencesFailed"),
          error,
          "initializeApp",
        ),
      )
      .then(restoreKeptSession)
      .then(followLaunchDocuments)
      .catch((error) => handleUnexpectedError(error, "followLaunchDocuments"));

    return () => {
      disposables.dispose();
    };
  }, []);

  useTauriEvent<WindowCloseRequest>(
    WINDOW_CLOSE_REQUESTED_EVENT,
    async ({ payload }) => {
      // The backend closes on the next request while one is pending, so only a deliberate
      // decision answers it: a handler that keeps failing must stay silent to stay closable.
      if (!(await confirmWindowClose(payload))) {
        await declineWindowClose();
        return;
      }

      await writeDiagnosticOperationLifecycle({
        feature: "app",
        operation: "window",
        phase: "closing",
      });
      await getCurrentWindow().destroy();
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
  const language = useSettingsStore((state) => state.language);

  useEffect(() => {
    setAccentColor(accentColor);
  }, [accentColor]);

  useEffect(() => {
    localizer.setLanguage(language);
  }, [language]);

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
      <DroppedPathOverlay indicator={droppedPathIndicator} />
      <Toaster timeout={TOAST_TIMEOUT_MS} />
    </div>
  );
}
