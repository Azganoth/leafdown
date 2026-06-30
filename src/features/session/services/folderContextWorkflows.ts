import { scanFolderContext, type ArticleSortOrder } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { isSamePath } from "@/lib/path";

import { useSessionStore } from "../stores/session";

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

export const getSessionFolderScanOptions = () => {
  const { articleSortOrder, ignoredDirectories } = useSettingsStore.getState();

  return {
    ignoredDirectories,
    sortOrder: articleSortOrder,
  };
};

export const getSessionFolderOpenOptions = () => {
  const { articleSortOrder, ignoredDirectories, indexFileNames } = useSettingsStore.getState();

  return {
    ignoredDirectories,
    indexFileNames,
    sortOrder: articleSortOrder,
  };
};
