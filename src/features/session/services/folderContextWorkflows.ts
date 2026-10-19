import { scanFolderContext, type ArticleSortOrder } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { isSamePath } from "@/lib/path";

import { useNamedFoldersStore } from "../stores/namedFolders";
import { useSessionStore } from "../stores/session";
import { getSessionFolderScanOptions } from "./folderContextOptions";
import { activateNamedFolder } from "./namedFolderWorkflows";
import { confirmDiscardAllDocumentChanges } from "./unsavedChanges";

/** Closes the folder context together with every tab, returning the window to the welcome screen. */
export const closeFolderContext = async () => {
  if (useNamedFoldersStore.getState().activeId) {
    return activateNamedFolder(null);
  }
  if (!useSessionStore.getState().folderContext) {
    return false;
  }

  if (!(await confirmDiscardAllDocumentChanges())) {
    return false;
  }

  useSessionStore.getState().reset();

  return true;
};

export const changeArticleSortOrder = async (sortOrder: ArticleSortOrder) => {
  const folderContext = useSessionStore.getState().folderContext;
  const settings = useSettingsStore.getState();

  if (!folderContext || settings.articleSortOrder === sortOrder) {
    return false;
  }

  const previousSortOrder = settings.articleSortOrder;
  const folderPath = folderContext.path;
  settings.updateSetting("articleSortOrder", sortOrder);

  try {
    const nextFolderContext = await scanFolderContext(folderPath, getSessionFolderScanOptions());

    const activeFolderPath = useSessionStore.getState().folderContext?.path;

    if (activeFolderPath && isSamePath(activeFolderPath, folderPath)) {
      useSessionStore.getState().setFolderContext(nextFolderContext);
    }

    return true;
  } catch (error) {
    const latestSettings = useSettingsStore.getState();

    if (latestSettings.articleSortOrder === sortOrder) {
      latestSettings.updateSetting("articleSortOrder", previousSortOrder);
    }

    throw error;
  }
};

export const refreshFolderContext = async () => {
  const folderPath = useSessionStore.getState().folderContext?.path;

  if (!folderPath) {
    return;
  }

  const nextFolderContext = await scanFolderContext(folderPath, getSessionFolderScanOptions());
  const activeFolderPath = useSessionStore.getState().folderContext?.path;

  if (activeFolderPath && isSamePath(activeFolderPath, folderPath)) {
    useSessionStore.getState().setFolderContext(nextFolderContext);
  }
};

export { getSessionFolderScanOptions, getSessionFolderOpenOptions } from "./folderContextOptions";
