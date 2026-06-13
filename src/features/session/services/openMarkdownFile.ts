import { openMarkdownDocument, selectMarkdownFilePath, toSavedDocument } from "@/features/document";
import { scanFolderContext } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";

import { useSessionHistoryStore } from "../stores/history";
import { useSessionStore } from "../stores/session";
import { confirmActiveDocumentTransition } from "./dirtyDocumentTransitions";

export const openMarkdownFilePath = async (path: string) => {
  if (!(await confirmActiveDocumentTransition())) {
    return false;
  }

  const openedDocument = await openMarkdownDocument(path);
  const { parentFolderPath, ...documentFields } = openedDocument;
  const { articleSortOrder, ignoredDirectories } = useSettingsStore.getState();
  const folderContext = await scanFolderContext(parentFolderPath, {
    ignoredDirectories,
    sortOrder: articleSortOrder,
  });

  useSessionStore.getState().setDocumentSession(folderContext, toSavedDocument(documentFields));
  useSessionHistoryStore.getState().recordRecentFile(documentFields.path);
  useSessionHistoryStore.getState().recordRecentFolder(folderContext.path);

  return true;
};

export const openMarkdownFile = async () => {
  const selectedPath = await selectMarkdownFilePath();

  return selectedPath ? openMarkdownFilePath(selectedPath) : false;
};
