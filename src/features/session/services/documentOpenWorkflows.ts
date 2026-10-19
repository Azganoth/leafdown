import {
  ENCODING_CHOICES,
  getOpenMarkdownFileErrorMessage,
  isEncodingOpenError,
  matchesActiveDocumentKey,
  openMarkdownDocument,
  toSavedDocument,
  type TextEncodingName,
} from "@/features/document";
import { getScanFolderContextErrorMessage, scanFolderContext } from "@/features/folder-context";
import { useRecentItemsStore, useSettingsStore } from "@/features/preferences";
import {
  type CancellationToken,
  isCancellationError,
  runWithCancellation,
} from "@/lib/cancellation";
import { t } from "@/lib/i18n";
import type { MessageData } from "@/lib/messages";
import { notifyError, notifyErrorWithActionMenu, notifySuccess } from "@/lib/toast";

import {
  findTab,
  findTabByPath,
  useSessionStore,
  type DocumentTab,
  type FolderContextLoad,
} from "../stores/session";
import { getSessionFolderScanOptions } from "./folderContextOptions";
import { openTransitionRunner } from "./sessionTasks";
import { confirmDiscardTabChanges } from "./unsavedChanges";
import { claimDocumentForWindow } from "./windowDocumentClaims";

interface OpenMarkdownFileOptions {
  /** Reads the file again into the tab already holding it, instead of only activating that tab. */
  reload?: boolean;
  /** Leaves the active tab as it is when reloading a document open in another tab. */
  activate?: boolean;
  /** Skips asking about the open tab's unsaved changes, which the caller has already settled. */
  discardConfirmed?: boolean;
  encoding?: TextEncodingName;
  /** Opens the file to look at, in the window's preview tab. */
  preview?: boolean;
}

/**
 * Opens a file in a new tab after the active one, or activates the tab already holding it. Only a
 * preview replaces another document, and only the clean one in the window's preview tab. Any
 * other open of the file in the preview tab keeps that tab.
 */
export const openMarkdownFileAtPath = (
  path: string,
  {
    activate = true,
    discardConfirmed = false,
    encoding,
    preview = false,
    reload = false,
  }: OpenMarkdownFileOptions = {},
) =>
  runLatestOpenTransition(async (cancellationToken) => {
    const openTab = findTabByPath(useSessionStore.getState(), path);

    if (openTab && !reload) {
      activateOpenTab(openTab, preview);
      recordRecentFile(openTab.document.status === "saved" ? openTab.document.path : path);

      return true;
    }

    if (openTab) {
      return reloadTab(openTab, { activate, discardConfirmed, encoding }, cancellationToken);
    }

    const claim = await claimDocumentForWindow(path, { activate: true });

    if (!claim) {
      recordRecentFile(path);

      return true;
    }

    try {
      return await openClaimedMarkdownFile(path, { encoding, preview }, cancellationToken);
    } finally {
      claim.dispose();
    }
  });

const activateOpenTab = (tab: DocumentTab, preview: boolean) => {
  const session = useSessionStore.getState();

  session.activateTab(tab.id);

  if (!preview) {
    session.keepTab(tab.id);
  }
};

const openClaimedMarkdownFile = async (
  path: string,
  { encoding, preview }: { encoding?: TextEncodingName; preview: boolean },
  cancellationToken: CancellationToken,
) => {
  const openedDocument = await openMarkdownDocument(path, cancellationToken, encoding);
  const { parentFolderPath, ...documentFields } = openedDocument;
  const session = useSessionStore.getState();
  const tabOpenedMeanwhile = findTabByPath(session, documentFields.path);

  if (tabOpenedMeanwhile) {
    activateOpenTab(tabOpenedMeanwhile, preview);
    recordRecentFile(documentFields.path);

    return true;
  }

  const savedDocument = toSavedDocument(documentFields);

  if (session.folderContext || session.folderContextLoad) {
    session.openTab(savedDocument, { preview });
    recordRecentFile(documentFields.path);

    return true;
  }

  const { folderContextLoad } = session.openTabWithFolderContextLoad(
    parentFolderPath,
    savedDocument,
    { preview },
  );
  recordRecentFile(documentFields.path);
  void loadFolderContext(folderContextLoad);

  return true;
};

/**
 * The editor keeps its state across a same-path update, so a reload must say when the text
 * changed. The tab's text predates any edits, so an edited document is replaced: its edits were
 * already discarded to reload it.
 */
const reloadTab = async (
  tab: DocumentTab,
  {
    activate,
    discardConfirmed,
    encoding,
  }: Pick<OpenMarkdownFileOptions, "activate" | "discardConfirmed" | "encoding">,
  cancellationToken: CancellationToken,
) => {
  if (
    !discardConfirmed &&
    !(await runWithCancellation(cancellationToken, () => confirmDiscardTabChanges([tab.id])))
  ) {
    return false;
  }

  const path = tab.document.status === "saved" ? tab.document.path : null;

  if (!path) {
    return false;
  }

  const openedDocument = await openMarkdownDocument(path, cancellationToken, encoding);
  const { parentFolderPath: _parentFolderPath, ...documentFields } = openedDocument;
  const savedDocument = toSavedDocument(documentFields);
  const session = useSessionStore.getState();
  const latestTab = findTab(session, tab.id);

  if (!latestTab || !matchesActiveDocumentKey(latestTab.document, path)) {
    return false;
  }

  session.replaceTabDocument(tab.id, savedDocument, {
    reload: latestTab.document.isDirty || latestTab.document.content !== savedDocument.content,
  });

  if (activate) {
    session.activateTab(tab.id);
  }

  recordRecentFile(documentFields.path);

  return true;
};

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
    const opened = await openMarkdownFileAtPath(path, { encoding, reload: true });

    if (opened) {
      notifySuccess(t("session.documentOpened"));
    }

    return opened;
  } catch (error) {
    notifyOpenMarkdownFileError(error);
    return false;
  }
};

export const runLatestOpenTransition = async (
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

export const recordRecentFolderSession = (folderPath: string) => {
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

export const notifyFolderIndexOpenFailure = (error: unknown) => {
  if (!error) {
    return;
  }

  const indexError = getOpenMarkdownFileErrorMessage(error);

  notifyOpenMarkdownFileError(error, {
    title: t("session.openFolderIndexFailed"),
    description: indexError.description ?? indexError.title,
  });
};
