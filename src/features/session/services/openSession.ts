import { selectMarkdownFilePath, toSavedDocument } from "@/features/document";
import { openFolderContext, selectFolderContextPath } from "@/features/folder-context";
import { throwIfCancelled } from "@/lib/cancellation";

import { useNamedFoldersStore } from "../stores/namedFolders";
import { findTabByPath, useSessionStore } from "../stores/session";
import {
  notifyOpenMarkdownFileError,
  notifyFolderIndexOpenFailure,
  recordRecentFolderSession,
  runLatestOpenTransition,
  openMarkdownFileAtPath as openDocument,
} from "./documentOpenWorkflows";
import { getSessionFolderOpenOptions } from "./folderContextOptions";
import { takeLaunchDocumentPaths } from "./launchDocumentApi";
import { activateNamedFolder } from "./namedFolderWorkflows";
import { claimDocumentForWindow, DocumentOwnedByContext } from "./windowDocumentClaims";
export {
  notifyOpenMarkdownFileError,
  reopenMarkdownFileWithChosenEncoding,
} from "./documentOpenWorkflows";
let launchDocumentsOpened: Promise<unknown> = Promise.resolve();
export const openMarkdownFileAtPath = async (...args: Parameters<typeof openDocument>) => {
  if (useNamedFoldersStore.getState().transitioning) {
    return false;
  }
  try {
    return await openDocument(...args);
  } catch (error) {
    if (error instanceof DocumentOwnedByContext) {
      return activateNamedFolder(error.contextId, false, error.path);
    }
    throw error;
  }
};
/**
 * Opens the files launches asked this window to open, once persisted stores are ready: the file
 * the process started with, then those later launches route here. Each waits for the one before
 * it, since a newer open cancels one still in progress.
 */
export const openLaunchDocuments = () => {
  const opened = launchDocumentsOpened.then(async () => {
    let openedAny = false;

    for (const path of await takeLaunchDocumentPaths()) {
      openedAny = (await openLaunchDocument(path)) || openedAny;
    }

    return openedAny;
  });

  launchDocumentsOpened = opened.catch(() => undefined);

  return opened;
};

const openLaunchDocument = async (path: string) => {
  try {
    return await openMarkdownFileAtPath(path);
  } catch (error) {
    notifyOpenMarkdownFileError(error);
    return false;
  }
};

export const pickAndOpenMarkdownFile = async () => {
  const selectedPath = await selectMarkdownFilePath();

  if (!selectedPath) {
    return false;
  }

  return openMarkdownFileAtPath(selectedPath);
};

/**
 * Replaces the folder context and keeps the open tabs, opening the folder's index file in the
 * preview tab. An index file open in another window stays there, and the folder opens here
 * without it.
 */
export const openFolderContextAtPath = async (path: string) => {
  if (useNamedFoldersStore.getState().transitioning) {
    return false;
  }
  if (useNamedFoldersStore.getState().activeId && !(await activateNamedFolder(null))) {
    return false;
  }
  return runLatestOpenTransition(async (cancellationToken) => {
    const { folderContext, indexDocument, indexError } = await openFolderContext(
      path,
      getSessionFolderOpenOptions(),
      cancellationToken,
    );
    const indexTab = indexDocument && findTabByPath(useSessionStore.getState(), indexDocument.path);
    const indexClaim =
      indexDocument && !indexTab
        ? await claimDocumentForWindow(indexDocument.path, { activate: false })
        : null;

    try {
      throwIfCancelled(cancellationToken);

      const session = useSessionStore.getState();

      if (indexTab) {
        session.setFolderContext(folderContext);
        session.activateTab(indexTab.id);
      } else if (indexDocument && indexClaim) {
        session.openTab(toSavedDocument(indexDocument), { folderContext, preview: true });
      } else {
        session.setFolderContext(folderContext);
      }
    } finally {
      indexClaim?.dispose();
    }

    recordRecentFolderSession(folderContext.path);
    notifyFolderIndexOpenFailure(indexError);

    return true;
  });
};

export const pickAndOpenFolderContext = async () => {
  const selectedPath = await selectFolderContextPath();

  if (!selectedPath) {
    return false;
  }

  return openFolderContextAtPath(selectedPath);
};
