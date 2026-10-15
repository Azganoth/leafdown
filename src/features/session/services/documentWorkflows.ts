import { documentDir, join } from "@tauri-apps/api/path";

import {
  ensureMarkdownExtension,
  formatEncodingName,
  formatMarkdownForSave,
  formatUnrepresentableCharacters,
  getActiveDocumentKey,
  isSaveMarkdownFileError,
  isUnrepresentableCharactersError,
  NEW_DOCUMENT_ENCODING,
  saveMarkdownDocument,
  selectMarkdownSavePath,
  toSavedDocument,
  toUntitledDocument,
  UTF8_ENCODING,
  type ActiveDocumentState,
  type DocumentEncoding,
  type LineEnding,
  type SavedDocumentState,
  type SaveMarkdownFileError,
  type UnrepresentableCharactersError,
} from "@/features/document";
import { scanFolderContext } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { SequentialTaskQueue } from "@/lib/async";
import { requestConfirmation } from "@/lib/confirmation";
import { t } from "@/lib/i18n";
import { getPathParts, isSameOrParentPath } from "@/lib/path";
import { notifyError } from "@/lib/toast";

import {
  findCurrentTab,
  findTab,
  findTabByDocumentKey,
  findTabByPath,
  getActiveTab,
  getSessionFolderPath,
  useSessionStore,
  type DocumentTab,
} from "../stores/session";
import {
  getDocumentName,
  getNextUntitledNumber,
  toUntitledDocumentId,
} from "../utils/documentNames";
import { documentEditorBridge } from "./documentEditorBridge";
import { getSessionFolderScanOptions } from "./folderContextWorkflows";
import { confirmDiscardTabChanges } from "./unsavedChanges";
import { claimDocumentForWindow } from "./windowDocumentClaims";

interface SerializedDocumentForSave {
  content: string;
  lineEnding: LineEnding;
  encoding: DocumentEncoding;
}

/** A tab together with the version of its document a workflow started from. */
interface TabVersion {
  tabId: string;
  generation: number;
}

const saveTaskQueue = new SequentialTaskQueue();

const toTabVersion = ({ generation, id }: DocumentTab): TabVersion => ({
  tabId: id,
  generation,
});

const getCurrentDocument = ({ generation, tabId }: TabVersion) =>
  findCurrentTab(useSessionStore.getState(), tabId, generation)?.document ?? null;

export const createNewMarkdownDocument = async () => {
  const { defaultNewDocumentLineEnding } = useSettingsStore.getState();
  const { tabs } = useSessionStore.getState();
  const number = getNextUntitledNumber(tabs.map((tab) => tab.document));

  useSessionStore.getState().openTab(
    toUntitledDocument({
      id: toUntitledDocumentId(number),
      content: "",
      lineEnding: defaultNewDocumentLineEnding,
      encoding: NEW_DOCUMENT_ENCODING,
    }),
  );

  return true;
};

export const closeDocumentTab = async (tabId: string) => {
  if (!findTab(useSessionStore.getState(), tabId)) {
    return false;
  }

  if (!(await confirmDiscardTabChanges([tabId]))) {
    return false;
  }

  const wasActive = useSessionStore.getState().activeTabId === tabId;

  useSessionStore.getState().closeTabs([tabId]);

  const nextActiveTab = getActiveTab(useSessionStore.getState());

  if (wasActive && nextActiveTab) {
    documentEditorBridge.focusWhenShown(getActiveDocumentKey(nextActiveTab.document));
  }

  return true;
};

export const closeActiveMarkdownDocument = async () => {
  const { activeTabId } = useSessionStore.getState();

  return activeTabId ? closeDocumentTab(activeTabId) : false;
};

export const runAfterPendingSaves = <T>(task: () => Promise<T>) => saveTaskQueue.run(task);

export const saveDocumentTab = (tabId: string) =>
  saveTaskQueue.run(async () => {
    const tab = findTab(useSessionStore.getState(), tabId);

    return tab ? saveDocumentNow(toTabVersion(tab)) : false;
  });

// The tab is taken when the command is given, since another tab may be active by the time a
// queued save runs. Saving a clean preview keeps its tab and has nothing to write.
export const saveActiveMarkdownDocument = () => {
  const session = useSessionStore.getState();
  const activeTab = getActiveTab(session);

  if (activeTab?.preview && activeTab.document.status === "saved" && !activeTab.document.isDirty) {
    session.keepTab(activeTab.id);

    return Promise.resolve(false);
  }

  return activeTab ? saveDocumentTab(activeTab.id) : Promise.resolve(false);
};

export const saveActiveMarkdownDocumentAs = () => {
  const activeTabId = useSessionStore.getState().activeTabId;

  return activeTabId
    ? saveTaskQueue.run(async () => {
        const tab = findTab(useSessionStore.getState(), activeTabId);

        return tab ? saveDocumentAsNow(toTabVersion(tab)) : false;
      })
    : Promise.resolve(false);
};

const saveDocumentNow = async (version: TabVersion) => {
  const document = getCurrentDocument(version);

  if (!document) {
    return false;
  }

  if (document.status === "untitled") {
    return saveDocumentAsNow(version);
  }

  return saveExistingMarkdownDocument(document, serializeDocumentForSave(document), version);
};

const saveDocumentAsNow = async (version: TabVersion) => {
  const document = getCurrentDocument(version);

  if (!document) {
    return false;
  }

  const defaultPath = await getSaveAsDefaultPath(document);
  const selectedPath = await selectMarkdownSavePath(defaultPath);

  if (!selectedPath) {
    return false;
  }

  const { defaultNewDocumentExtension } = useSettingsStore.getState();
  const path = await ensureMarkdownExtension(selectedPath, defaultNewDocumentExtension);
  const otherTab = findTabByPath(useSessionStore.getState(), path);

  // Two tabs holding one file would each save over the other's changes.
  if (otherTab && otherTab.id !== version.tabId) {
    notifyError({
      title: t("session.saveAsOpenInTab.title"),
      description: t("session.saveAsOpenInTab.description", {
        name: getDocumentName(otherTab.document, t),
      }),
    });

    return false;
  }

  const claim = await claimDocumentForWindow(path, { activate: false });

  if (!claim) {
    notifyError({
      title: t("session.saveAsOpenInTab.title"),
      description: t("session.saveAsOpenInWindow.description", {
        name: getPathParts(path).name,
      }),
    });

    return false;
  }

  try {
    return await saveDocumentToNewPath(version, path);
  } finally {
    claim.dispose();
  }
};

const saveDocumentToNewPath = async (version: TabVersion, path: string): Promise<boolean> => {
  const latestDocument = getCurrentDocument(version);

  if (!latestDocument) {
    return false;
  }

  const serializedDocument = serializeDocumentForSave(latestDocument);
  let result;

  try {
    result = await saveMarkdownDocument(
      path,
      serializedDocument.content,
      serializedDocument.encoding,
    );
  } catch (error) {
    if (!isUnrepresentableCharactersError(error)) {
      throw error;
    }

    return handleUnrepresentableCharacters(error, version, () =>
      saveDocumentToNewPath(version, path),
    );
  }

  const { folderContext: existingFolderContext, folderContextLoad } = useSessionStore.getState();
  const nextFolderContext = folderContextLoad
    ? null
    : await getFolderContextAfterSaveAs(
        result.path,
        result.parentFolderPath,
        existingFolderContext,
      );

  if (!getCurrentDocument(version)) {
    return false;
  }

  const savedDocument = toSavedDocument({
    path: result.path,
    content: serializedDocument.content,
    lineEnding: serializedDocument.lineEnding,
    encoding: serializedDocument.encoding,
    metadata: result.metadata,
    fingerprint: result.fingerprint,
  });

  useSessionStore
    .getState()
    .replaceTabDocument(
      version.tabId,
      savedDocument,
      nextFolderContext ? { folderContext: nextFolderContext, keep: true } : { keep: true },
    );

  return true;
};

const serializeDocumentForSave = (document: ActiveDocumentState): SerializedDocumentForSave => {
  const { defaultNewDocumentLineEnding, insertFinalNewline } = useSettingsStore.getState();
  const lineEnding = document.lineEnding ?? defaultNewDocumentLineEnding;
  const documentKey = getActiveDocumentKey(document);
  const markdown = documentEditorBridge.getMarkdown(documentKey) ?? document.content;

  return {
    content: formatMarkdownForSave(markdown, lineEnding, insertFinalNewline),
    lineEnding,
    encoding: document.encoding,
  };
};

/**
 * The session holds a document's text only as it was opened or saved, and reads edits from its
 * editor. An editor that lets go of an edited document that stays open hands its text over, so
 * Save, or the next editor, does not fall back to the text from before the edits.
 */
export const retainEditorMarkdown = (documentKey: string) => {
  const session = useSessionStore.getState();

  if (!findTabByDocumentKey(session, documentKey)?.document.isDirty) {
    return;
  }

  const markdown = documentEditorBridge.getMarkdown(documentKey);

  if (markdown !== null) {
    session.setDocumentContent(documentKey, markdown);
  }
};

const saveExistingMarkdownDocument = async (
  document: SavedDocumentState,
  serializedDocument: SerializedDocumentForSave,
  version: TabVersion,
  overwrite = false,
): Promise<boolean> => {
  try {
    const result = await saveMarkdownDocument(
      document.path,
      serializedDocument.content,
      serializedDocument.encoding,
      {
        expectedMetadata: document.metadata,
        overwrite,
      },
    );

    if (!getCurrentDocument(version)) {
      return false;
    }

    useSessionStore.getState().replaceTabDocument(
      version.tabId,
      toSavedDocument({
        path: result.path,
        content: serializedDocument.content,
        lineEnding: serializedDocument.lineEnding,
        encoding: serializedDocument.encoding,
        metadata: result.metadata,
        fingerprint: result.fingerprint,
      }),
      { keep: true },
    );

    return true;
  } catch (error) {
    if (isMissingFileSaveError(error)) {
      if (!getCurrentDocument(version)) {
        return false;
      }

      return handleMissingSavedFile(version);
    }

    if (isExternalModificationSaveError(error)) {
      if (!getCurrentDocument(version)) {
        return false;
      }

      return handleExternalModification(version);
    }

    if (isUnrepresentableCharactersError(error)) {
      return handleUnrepresentableCharacters(error, version, () => {
        const latestDocument = getCurrentDocument(version);

        if (latestDocument?.status !== "saved") {
          return Promise.resolve(false);
        }

        return saveExistingMarkdownDocument(
          latestDocument,
          serializeDocumentForSave(latestDocument),
          version,
          overwrite,
        );
      });
    }

    throw error;
  }
};

export type UnpromptedSaveResult =
  | { kind: "saved" }
  | { kind: "closed" }
  | { kind: "failed"; error: SaveMarkdownFileError };

/**
 * Saves an open saved document as Save does, but reports a missing file, a newer version on disk,
 * or text its encoding cannot hold instead of asking about it.
 */
export const saveDocumentWithoutPrompts = (documentKey: string) =>
  saveTaskQueue.run(async (): Promise<UnpromptedSaveResult> => {
    const tab = findTabByDocumentKey(useSessionStore.getState(), documentKey);

    if (tab?.document.status !== "saved") {
      return { kind: "closed" };
    }

    const { document } = tab;
    const serializedDocument = serializeDocumentForSave(document);
    let result;

    try {
      result = await saveMarkdownDocument(
        document.path,
        serializedDocument.content,
        serializedDocument.encoding,
        { expectedMetadata: document.metadata },
      );
    } catch (error) {
      if (isSaveMarkdownFileError(error)) {
        return { kind: "failed", error };
      }

      throw error;
    }

    if (getCurrentDocument(toTabVersion(tab))) {
      useSessionStore.getState().replaceTabDocument(
        tab.id,
        toSavedDocument({
          path: result.path,
          content: serializedDocument.content,
          lineEnding: serializedDocument.lineEnding,
          encoding: serializedDocument.encoding,
          metadata: result.metadata,
          fingerprint: result.fingerprint,
        }),
        { keep: true },
      );
    }

    return { kind: "saved" };
  });

const handleUnrepresentableCharacters = async (
  error: UnrepresentableCharactersError,
  version: TabVersion,
  saveAgain: () => Promise<boolean>,
) => {
  if (!getCurrentDocument(version)) {
    return false;
  }

  const shouldConvert = await requestConfirmation({
    title: t("session.unrepresentableCharacters.title"),
    message: t("session.unrepresentableCharacters.message", {
      encoding: formatEncodingName(error.encoding),
    }),
    detail: formatUnrepresentableCharacters(error.characters),
    confirmLabel: t("session.unrepresentableCharacters.confirm"),
    cancelLabel: t("session.unrepresentableCharacters.cancel"),
  });
  const document = shouldConvert ? getCurrentDocument(version) : null;

  if (!document) {
    return false;
  }

  useSessionStore.getState().setDocumentEncoding(getActiveDocumentKey(document), UTF8_ENCODING);

  return saveAgain();
};

const handleMissingSavedFile = async (version: TabVersion) => {
  const shouldSaveAs = await requestConfirmation({
    title: t("session.missingSavedFile.title"),
    message: t("session.missingSavedFile.message"),
    confirmLabel: t("session.missingSavedFile.confirm"),
    cancelLabel: t("session.missingSavedFile.cancel"),
  });

  if (!shouldSaveAs || !getCurrentDocument(version)) {
    return false;
  }

  return saveDocumentAsNow(version);
};

const handleExternalModification = async (version: TabVersion) => {
  const shouldOverwrite = await requestConfirmation({
    title: t("session.externalModification.title"),
    message: t("session.externalModification.message"),
    confirmLabel: t("session.externalModification.confirm"),
    cancelLabel: t("session.externalModification.cancel"),
  });

  if (!shouldOverwrite) {
    return false;
  }

  const latestDocument = getCurrentDocument(version);

  if (latestDocument?.status !== "saved") {
    return false;
  }

  return saveExistingMarkdownDocument(
    latestDocument,
    serializeDocumentForSave(latestDocument),
    version,
    true,
  );
};

const isMissingFileSaveError = (error: unknown) =>
  isSaveMarkdownFileError(error) && error.kind === "missingFile";

const isExternalModificationSaveError = (error: unknown) =>
  isSaveMarkdownFileError(error) && error.kind === "externalModification";

const getSaveAsDefaultPath = async (document: ActiveDocumentState) => {
  if (document.status === "saved") {
    return document.path;
  }

  const fileName = `${t("session.untitledFileName")}${useSettingsStore.getState().defaultNewDocumentExtension}`;
  const folderPath = getSessionFolderPath(useSessionStore.getState()) ?? (await documentDir());

  return join(folderPath, fileName);
};

const getFolderContextAfterSaveAs = async (
  savedFilePath: string,
  savedParentFolderPath: string,
  existingFolderContext: ReturnType<typeof useSessionStore.getState>["folderContext"],
) => {
  if (!existingFolderContext) {
    return scanFolderContext(savedParentFolderPath, getSessionFolderScanOptions());
  }

  if (isSameOrParentPath(existingFolderContext.path, savedFilePath)) {
    return scanFolderContext(existingFolderContext.path, getSessionFolderScanOptions());
  }

  return null;
};
