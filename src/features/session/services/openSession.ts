import {
  ENCODING_CHOICES,
  getActiveDocumentKey,
  getOpenMarkdownFileErrorMessage,
  isEncodingOpenError,
  matchesActiveDocumentKey,
  openMarkdownDocument,
  selectMarkdownFilePath,
  toSavedDocument,
  type TextEncodingName,
  type SavedDocumentState,
} from "@/features/document";
import {
  getScanFolderContextErrorMessage,
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
import { t } from "@/lib/i18n";
import type { MessageData } from "@/lib/messages";
import { notifyError, notifyErrorWithActionMenu, notifySuccess } from "@/lib/toast";

import { type FolderContextLoad, useSessionStore } from "../stores/session";
import { getSessionFolderOpenOptions, getSessionFolderScanOptions } from "./folderContextWorkflows";
import { takeLaunchDocumentPath } from "./launchDocumentApi";
import { confirmDiscardActiveDocumentChanges } from "./unsavedChanges";

const openTransitionRunner = new RestartableTaskRunner();

interface OpenMarkdownFileOptions {
  discardConfirmed?: boolean;
  encoding?: TextEncodingName;
}

export const openMarkdownFileAtPath = (
  path: string,
  { discardConfirmed = false, encoding }: OpenMarkdownFileOptions = {},
) =>
  runLatestOpenTransition(async (cancellationToken) => {
    if (
      !discardConfirmed &&
      !(await runWithCancellation(cancellationToken, confirmDiscardActiveDocumentChanges))
    ) {
      return false;
    }

    const initialDocumentKey = getActiveDocumentKeySnapshot();
    const openedDocument = await openMarkdownDocument(path, cancellationToken, encoding);
    const { parentFolderPath, ...documentFields } = openedDocument;
    const savedDocument = toSavedDocument(documentFields);

    if (!activeDocumentMatchesSnapshot(initialDocumentKey)) {
      return false;
    }

    const session = useSessionStore.getState();
    const reload = replacesActiveDocumentText(savedDocument);

    if (session.folderContext || session.folderContextLoad) {
      session.setActiveDocument(savedDocument, { reload });
      recordRecentFile(documentFields.path);

      return true;
    }

    const folderContextLoad = session.setActiveDocumentWithFolderContextLoad(
      parentFolderPath,
      savedDocument,
      { reload },
    );
    recordRecentFile(documentFields.path);
    void loadFolderContext(folderContextLoad);

    return true;
  });

/** The document is already open, so a slow or failed scan of its folder only delays or loses the navigator. */
const loadFolderContext = async ({ id, path }: FolderContextLoad) => {
  try {
    const folderContext = await scanFolderContext(path, getSessionFolderScanOptions());

    if (useSessionStore.getState().finishFolderContextLoad(id, folderContext)) {
      recordRecentFolderSession(folderContext.path);
    }
  } catch (error) {
    if (useSessionStore.getState().abandonFolderContextLoad(id)) {
      notifyError(getScanFolderContextErrorMessage(error));
    }
  }
};

/** The editor keeps its state across a same-path update, so a reopen must say when the text changed. */
const replacesActiveDocumentText = (openedDocument: SavedDocumentState) => {
  const { activeDocument } = useSessionStore.getState();

  return (
    activeDocument !== null &&
    matchesActiveDocumentKey(activeDocument, openedDocument.path) &&
    activeDocument.content !== openedDocument.content
  );
};

export const notifyOpenMarkdownFileError = (
  error: unknown,
  message: MessageData = getOpenMarkdownFileErrorMessage(error),
) => {
  if (!isEncodingOpenError(error)) {
    notifyError(message);
    return;
  }

  notifyErrorWithActionMenu(message, {
    label: t("session.reopenWithEncoding"),
    items: ENCODING_CHOICES.map((choice) => ({
      label: t(choice.labelId),
      run: () => void reopenMarkdownFileWithChosenEncoding(error.path, choice.name),
    })),
  });
};

export const reopenMarkdownFileWithChosenEncoding = async (
  path: string,
  encoding: TextEncodingName,
) => {
  try {
    const opened = await openMarkdownFileAtPath(path, { encoding });

    if (opened) {
      notifySuccess(t("session.documentOpened"));
    }

    return opened;
  } catch (error) {
    notifyOpenMarkdownFileError(error);
    return false;
  }
};

/** Opens the file the operating system launched Leafdown with, once persisted stores are ready. */
export const openLaunchDocument = async () => {
  const path = await takeLaunchDocumentPath();

  if (!path) {
    return false;
  }

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

export const openFolderContextAtPath = (path: string) =>
  runLatestOpenTransition(async (cancellationToken) => {
    if (!(await runWithCancellation(cancellationToken, confirmDiscardActiveDocumentChanges))) {
      return false;
    }

    const initialDocumentKey = getActiveDocumentKeySnapshot();
    const { folderContext, indexDocument, indexError } = await openFolderContext(
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
    notifyFolderIndexOpenFailure(indexError);

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

const recordRecentFolderSession = (folderPath: string) => {
  if (!useSettingsStore.getState().recordRecentItems) {
    return;
  }

  recordRecentFolder(folderPath);
};

const recordRecentFile = (filePath: string) => {
  if (!useSettingsStore.getState().recordRecentItems) {
    return;
  }

  useRecentItemsStore.getState().recordRecentFile(filePath);
};

const recordRecentFolder = (folderPath: string) => {
  useRecentItemsStore.getState().recordRecentFolder(folderPath);
};

const notifyFolderIndexOpenFailure = (error: unknown) => {
  if (!error) {
    return;
  }

  const indexError = getOpenMarkdownFileErrorMessage(error);

  notifyOpenMarkdownFileError(error, {
    title: t("session.openFolderIndexFailed"),
    description: indexError.description ?? indexError.title,
  });
};
