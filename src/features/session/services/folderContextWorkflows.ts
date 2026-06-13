import { scanFolderContext, type ArticleSortOrder } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";

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
    const nextFolderContext = await scanFolderContext(folderPath, {
      ignoredDirectories: useSettingsStore.getState().ignoredDirectories,
      sortOrder,
    });

    if (useSessionStore.getState().folderContext?.path === folderPath) {
      useSessionStore.getState().setFolderContext(nextFolderContext);
    }

    return true;
  } catch (error) {
    useSettingsStore.getState().updateSetting("articleSortOrder", previousSortOrder);
    throw error;
  }
};
