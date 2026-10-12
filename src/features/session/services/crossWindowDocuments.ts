import { useArticleNavigatorStore } from "@/features/folder-context";
import { CancellationToken } from "@/lib/cancellation";
import { isSameOrParentPath } from "@/lib/path";

import { findTabByPath, useSessionStore } from "../stores/session";
import { runAfterPendingSaves } from "./documentWorkflows";
import { checkDocumentFile } from "./externalChanges";
import { moveOpenDocuments } from "./folderEntryWorkflows";
import { activateDocumentTab } from "./tabWorkflows";

/** Shows a document this window holds when another window was asked to open it. */
export const showDocumentOpenedElsewhere = (path: string) => {
  const tab = findTabByPath(useSessionStore.getState(), path);

  return tab ? activateDocumentTab(tab.id) : false;
};

/**
 * Follows a rename made in another window, moving the tabs under the old path with their unsaved
 * changes, as the window that renamed moves its own.
 */
export const followDocumentsMovedElsewhere = (fromPath: string, toPath: string) =>
  runAfterPendingSaves(async () => {
    moveOpenDocuments(fromPath, toPath);
    useArticleNavigatorStore.getState().moveDirectoryPaths(fromPath, toPath);
  });

/** Checks the documents under a path another window deleted, so their tabs show the file missing. */
export const checkDocumentsRemovedElsewhere = async (path: string) => {
  const removedPaths = useSessionStore
    .getState()
    .tabs.flatMap(({ document }) =>
      document.status === "saved" && isSameOrParentPath(path, document.path) ? [document.path] : [],
    );

  await Promise.all(
    removedPaths.map((removedPath) =>
      checkDocumentFile(removedPath, CancellationToken.None, "anotherWindow"),
    ),
  );
};
