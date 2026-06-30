import {
  getActiveDocumentKey,
  matchesActiveDocumentKey,
  openMarkdownDocument,
  selectMarkdownFilePath,
  toSavedDocument,
} from "@/features/document";
import {
  openFolderContext,
  scanFolderContext,
  selectFolderContextPath,
} from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import { RestartableTaskRunner } from "@/lib/async";
import {
  type CancellationToken,
  isCancellationError,
  runWithCancellation,
} from "@/lib/cancellation";

import { useSessionStore } from "../stores/session";
import { getSessionFolderOpenOptions, getSessionFolderScanOptions } from "./folderContextWorkflows";
import { confirmDiscardActiveDocumentChanges } from "./unsavedChanges";

const openTransitionRunner = new RestartableTaskRunner();

export const openMarkdownFileAtPath = (path: string) =>
  runLatestOpenTransition(async (cancellationToken) => {
    if (!(await runWithCancellation(cancellationToken, confirmDiscardActiveDocumentChanges))) {
      return false;
    }

    const initialDocumentKey = getActiveDocumentKeySnapshot();
    const openedDocument = await openMarkdownDocument(path, cancellationToken);
    const { parentFolderPath, ...documentFields } = openedDocument;
    const folderContext = await scanFolderContext(
      parentFolderPath,
      getSessionFolderScanOptions(),
      cancellationToken,
    );

    if (!activeDocumentMatchesSnapshot(initialDocumentKey)) {
      return false;
    }

    useSessionStore
      .getState()
      .setActiveDocumentSession(folderContext, toSavedDocument(documentFields));
    recordRecentFileSession(documentFields.path, folderContext.path);

    return true;
  });

export const pickAndOpenMarkdownFile = async () => {
  const selectedPath = await selectMarkdownFilePath();

  if (!selectedPath) {
    return false;
  }

  return openMarkdownFileAtPath(selectedPath);
};

export const openFolderContextAtPath = (path: string) =>
  runLatestOpenTransition(async (cancellationToken) => {
    if (!(await runWithCancellation(cancellationToken, confirmDiscardActiveDocumentChanges))) {
      return false;
    }

    const initialDocumentKey = getActiveDocumentKeySnapshot();
    const { folderContext, indexDocument } = await openFolderContext(
      path,
      getSessionFolderOpenOptions(),
      cancellationToken,
    );

    if (!activeDocumentMatchesSnapshot(initialDocumentKey)) {
      return false;
    }

    if (indexDocument) {
      useSessionStore
        .getState()
        .setActiveDocumentSession(folderContext, toSavedDocument(indexDocument));
    } else {
      useSessionStore.getState().setFolderOnlySession(folderContext);
    }

    recordRecentFolderSession(folderContext.path);

    return true;
  });

export const pickAndOpenFolderContext = async () => {
  const selectedPath = await selectFolderContextPath();

  if (!selectedPath) {
    return false;
  }

  return openFolderContextAtPath(selectedPath);
};

const getActiveDocumentKeySnapshot = () => {
  const { activeDocument } = useSessionStore.getState();

  if (!activeDocument) {
    return null;
  }

  return getActiveDocumentKey(activeDocument);
};

const activeDocumentMatchesSnapshot = (documentKey: string | null) => {
  const { activeDocument } = useSessionStore.getState();

  if (!activeDocument || !documentKey) {
    return documentKey === activeDocument;
  }

  return matchesActiveDocumentKey(activeDocument, documentKey);
};

const runLatestOpenTransition = async (
  transition: (cancellationToken: CancellationToken) => Promise<boolean>,
) => {
  try {
    return await openTransitionRunner.run(transition);
  } catch (error) {
    if (isCancellationError(error)) {
      return false;
    }

    throw error;
  }
};

const recordRecentFileSession = (filePath: string, folderPath: string) => {
  if (!useSettingsStore.getState().recordRecentItems) {
    return;
  }

  const recentItems = useRecentItemsStore.getState();
  recentItems.recordRecentFile(filePath);
  recentItems.recordRecentFolder(folderPath);
};

const recordRecentFolderSession = (folderPath: string) => {
  if (!useSettingsStore.getState().recordRecentItems) {
    return;
  }

  useRecentItemsStore.getState().recordRecentFolder(folderPath);
};
