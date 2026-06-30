import type { AppCommandContext } from "@/commands";
import { useSettingsStore } from "@/features/preferences";

import { createEditorCommandState } from "./editor";

type AppCommandContextFactoryOptions = Partial<
  Omit<AppCommandContext, "recentItems" | "settings" | "ui">
> & {
  recentItems?: Partial<AppCommandContext["recentItems"]>;
  settings?: Partial<AppCommandContext["settings"]>;
  ui?: Partial<AppCommandContext["ui"]>;
};

const createAppCommandSettingsContext = () => {
  const { articleSortOrder, insertFinalNewline, sidebarVisible, theme } =
    useSettingsStore.getState();

  return {
    articleSortOrder,
    insertFinalNewline,
    sidebarVisible,
    theme,
  };
};

export const createAppCommandContext = (
  overrides: AppCommandContextFactoryOptions = {},
): AppCommandContext => {
  const { recentItems, settings, ui, ...contextOverrides } = overrides;

  return {
    activeDocument: null,
    editor: createEditorCommandState(),
    folderContext: null,
    recentItems: { recentFiles: [], recentFolders: [], ...recentItems },
    settings: { ...createAppCommandSettingsContext(), ...settings },
    ui: {
      fullscreen: false,
      pendingSortOrder: null,
      zoom: 1,
      ...ui,
    },
    ...contextOverrides,
  };
};
