import { toSavedDocument } from "@/features/document";
import { openFolderContext, selectFolderContextPath } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";

import { useSessionHistoryStore } from "../stores/history";
import { useSessionStore } from "../stores/session";
import { confirmActiveDocumentTransition } from "./dirtyDocumentTransitions";

export const openFolderContextPath = async (path: string) => {
  if (!(await confirmActiveDocumentTransition())) {
    return false;
  }

  const { articleSortOrder, ignoredDirectories, indexFileNames } = useSettingsStore.getState();
  const { folderContext, indexDocument } = await openFolderContext(path, {
    ignoredDirectories,
    indexFileNames,
    sortOrder: articleSortOrder,
  });

  if (indexDocument) {
    useSessionStore.getState().setDocumentSession(folderContext, toSavedDocument(indexDocument));
  } else {
    useSessionStore.getState().setFolderSession(folderContext);
  }

  useSessionHistoryStore.getState().recordRecentFolder(folderContext.path);
  return true;
};

export const openFolderContextPicker = async () => {
  const selectedPath = await selectFolderContextPath();

  return selectedPath ? openFolderContextPath(selectedPath) : false;
};
