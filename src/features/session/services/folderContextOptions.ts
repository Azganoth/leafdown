import { useSettingsStore } from "@/features/preferences";

export const getSessionFolderScanOptions = () => {
  const { articleSortOrder, ignoredDirectories } = useSettingsStore.getState();
  return { ignoredDirectories, sortOrder: articleSortOrder };
};

export const getSessionFolderOpenOptions = () => {
  const { articleSortOrder, ignoredDirectories, indexFileNames } = useSettingsStore.getState();
  return { ignoredDirectories, indexFileNames, sortOrder: articleSortOrder };
};
