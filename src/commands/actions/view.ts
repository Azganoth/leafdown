import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  getArticleDirectoryPaths,
  getScanFolderContextErrorMessage,
  useArticleNavigatorStore,
  type ArticleSortOrder,
} from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { changeArticleSortOrder } from "@/features/session";
import { notifyOperationFailure } from "@/lib/errors";
import { notifyError } from "@/lib/toast";

import type { AppCommandContext } from "../context";
import { checked, disabled, enabled } from "../statePrimitives";
import { useCommandUIStore } from "../stores/commandUi";

const ZOOM_STEP = 0.1;
const MINIMUM_ZOOM = 0.5;
const MAXIMUM_ZOOM = 2;
const DEFAULT_ZOOM = 1;
const ZOOM_EPSILON = 0.001;

const updateZoom = async (zoom: number, setZoom: (zoom: number) => void) => {
  try {
    await getCurrentWebview().setZoom(zoom);
    setZoom(zoom);
  } catch (error) {
    notifyOperationFailure("Could not update zoom.", error, "updateZoom");
  }
};

const changeSortOrder = async (sortOrder: ArticleSortOrder) => {
  const { pendingSortOrder, setPendingSortOrder } = useCommandUIStore.getState();
  if (pendingSortOrder) {
    return;
  }

  setPendingSortOrder(sortOrder);
  try {
    await changeArticleSortOrder(sortOrder);
  } catch (error) {
    notifyError(getScanFolderContextErrorMessage(error));
  } finally {
    setPendingSortOrder(null);
  }
};

const getSortCommandState = (
  sortOrder: ArticleSortOrder,
  { folderContext, settings, ui }: AppCommandContext,
) => {
  const isChecked = settings.articleSortOrder === sortOrder;

  if (!folderContext) {
    return disabled("No folder context is open.");
  }

  return ui.pendingSortOrder
    ? disabled("The article navigator is refreshing.")
    : checked(isChecked);
};

const isZoomAt = (zoom: number, targetZoom: number) => Math.abs(zoom - targetZoom) < ZOOM_EPSILON;

/* Commands */

export const toggleSidebar = () => {
  const settings = useSettingsStore.getState();
  settings.updateSetting("sidebarVisible", !settings.sidebarVisible);
};

export const zoomIn = () => {
  const { zoom, setZoom } = useCommandUIStore.getState();
  void updateZoom(Math.min(MAXIMUM_ZOOM, zoom + ZOOM_STEP), setZoom);
};

export const zoomOut = () => {
  const { zoom, setZoom } = useCommandUIStore.getState();
  void updateZoom(Math.max(MINIMUM_ZOOM, zoom - ZOOM_STEP), setZoom);
};

export const resetZoom = () => {
  const { setZoom } = useCommandUIStore.getState();
  void updateZoom(DEFAULT_ZOOM, setZoom);
};

export const toggleFullscreen = async () => {
  const { fullscreen, setFullscreen } = useCommandUIStore.getState();
  const nextFullscreen = !fullscreen;
  try {
    await getCurrentWindow().setFullscreen(nextFullscreen);
    setFullscreen(nextFullscreen);
  } catch (error) {
    notifyOperationFailure("Could not update fullscreen mode.", error, "toggleFullscreen");
  }
};

export const setSystemTheme = () => {
  useSettingsStore.getState().updateSetting("theme", "system");
};

export const setLightTheme = () => {
  useSettingsStore.getState().updateSetting("theme", "light");
};

export const setDarkTheme = () => {
  useSettingsStore.getState().updateSetting("theme", "dark");
};

export const sortByName = () => {
  void changeSortOrder("name");
};

export const sortByModifiedDate = () => {
  void changeSortOrder("modifiedDate");
};

export const sortByType = () => {
  void changeSortOrder("type");
};

export const collapseAllFolders = () => {
  useArticleNavigatorStore.getState().collapseAll();
};

export const expandAllFolders = (context: AppCommandContext) => {
  if (context.folderContext) {
    useArticleNavigatorStore
      .getState()
      .expandDirectories(getArticleDirectoryPaths(context.folderContext.tree));
  }
};

/* State */

export const getToggleSidebarState = (context: AppCommandContext) =>
  checked(context.settings.sidebarVisible);

export const getZoomInState = (context: AppCommandContext) =>
  context.ui.zoom >= MAXIMUM_ZOOM ? disabled("Zoom is already at maximum.") : enabled();

export const getZoomOutState = (context: AppCommandContext) =>
  context.ui.zoom <= MINIMUM_ZOOM ? disabled("Zoom is already at minimum.") : enabled();

export const getResetZoomState = (context: AppCommandContext) =>
  isZoomAt(context.ui.zoom, DEFAULT_ZOOM) ? disabled("Zoom is already reset.") : enabled();

export const getFullscreenState = (context: AppCommandContext) => checked(context.ui.fullscreen);

export const getSystemThemeState = (context: AppCommandContext) =>
  checked(context.settings.theme === "system");

export const getLightThemeState = (context: AppCommandContext) =>
  checked(context.settings.theme === "light");

export const getDarkThemeState = (context: AppCommandContext) =>
  checked(context.settings.theme === "dark");

export const getSortByNameState = (context: AppCommandContext) =>
  getSortCommandState("name", context);

export const getSortByModifiedDateState = (context: AppCommandContext) =>
  getSortCommandState("modifiedDate", context);

export const getSortByTypeState = (context: AppCommandContext) =>
  getSortCommandState("type", context);

export const getCollapseAllFoldersState = (context: AppCommandContext) =>
  context.folderContext ? enabled() : disabled("No folder context is open.");

export const getExpandAllFoldersState = (context: AppCommandContext) =>
  context.folderContext ? enabled() : disabled("No folder context is open.");
