import "@/App.css";
import { TitleBar } from "@/components/app/TitleBar";
import { Toaster } from "@/components/ui/Sonner";
import { settingsStoreTauriHandler, useSettingsStore, type SettingsStore } from "@/stores/settings";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { setTheme as tauriSetTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect } from "react";

const updateTheme = async (theme: SettingsStore["theme"]) => {
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

    initializeApp();
  }, []);

  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    void updateTheme(theme);
  }, [theme]);

  return (
    <div className="flex h-screen flex-col">
      <TitleBar />
      <main className="mt-8 flex-1 overflow-hidden p-4">
        <span>Hallo!</span>
        <button
          onClick={() => useSettingsStore.getState().setTheme(theme === "dark" ? "light" : "dark")}
        >
          Toggle theme: {theme}
        </button>
      </main>
      <Toaster />
    </div>
  );
}

export default App;
