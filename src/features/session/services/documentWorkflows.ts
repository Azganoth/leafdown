import { documentDir, join } from "@tauri-apps/api/path";

import {
  ensureMarkdownExtension,
  formatEncodingName,
  formatMarkdownForSave,
  formatUnrepresentableCharacters,
  getActiveDocumentKey,
  isSaveMarkdownFileError,
  isUnrepresentableCharactersError,
  matchesActiveDocumentKey,
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
  type UnrepresentableCharactersError,
} from "@/features/document";
import { scanFolderContext } from "@/features/folder-context";
import { useSettingsStore } from "@/features/preferences";
import { SequentialTaskQueue } from "@/lib/async";
import { requestConfirmation } from "@/lib/confirmation";
import { t } from "@/lib/i18n";
import { isSameOrParentPath } from "@/lib/path";

import { useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";
import { getSessionFolderScanOptions } from "./folderContextWorkflows";
import { confirmDiscardActiveDocumentChanges } from "./unsavedChanges";

interface SerializedDocumentForSave {
  content: string;
  lineEnding: LineEnding;
  encoding: DocumentEncoding;
}

const saveTaskQueue = new SequentialTaskQueue();
let nextUntitledId = 1;

export const resetDocumentWorkflowIdsForTests = () => {
  nextUntitledId = 1;
};

export const createNewMarkdownDocument = async () => {
  if (!(await confirmDiscardActiveDocumentChanges())) {
    return false;
  }

  const { defaultNewDocumentLineEnding } = useSettingsStore.getState();

  useSessionStore.getState().setActiveDocument(
    toUntitledDocument({
      id: `untitled:${nextUntitledId++}`,
      content: "",
      lineEnding: defaultNewDocumentLineEnding,
      encoding: NEW_DOCUMENT_ENCODING,
    }),
  );

  return true;
};

export const closeActiveMarkdownDocument = async () => {
  if (!useSessionStore.getState().activeDocument) {
    return false;
  }

  if (!(await confirmDiscardActiveDocumentChanges())) {
    return false;
  }

  useSessionStore.getState().setActiveDocument(null);

  return true;
};

export const runAfterPendingSaves = <T>(task: () => Promise<T>) => saveTaskQueue.run(task);

export const saveActiveMarkdownDocument = () => saveTaskQueue.run(saveActiveMarkdownDocumentNow);

export const saveActiveMarkdownDocumentAs = () =>
  saveTaskQueue.run(saveActiveMarkdownDocumentAsNow);

const saveActiveMarkdownDocumentNow = async () => {
  const { activeDocument, activeDocumentGeneration } = useSessionStore.getState();

  if (!activeDocument) {
    return false;
  }

  if (activeDocument.status === "untitled") {
    return saveActiveMarkdownDocumentAsNow();
  }

  return saveExistingMarkdownDocument(
    activeDocument,
    serializeActiveDocumentForSave(activeDocument),
    activeDocumentGeneration,
  );
};

const saveActiveMarkdownDocumentAsNow = async () => {
  const { activeDocument, activeDocumentGeneration } = useSessionStore.getState();

  if (!activeDocument) {
    return false;
  }

  const documentKey = getActiveDocumentKey(activeDocument);
  const defaultPath = await getSaveAsDefaultPath(activeDocument);
  const selectedPath = await selectMarkdownSavePath(defaultPath);

  if (!selectedPath) {
    return false;
  }

  const { defaultNewDocumentExtension } = useSettingsStore.getState();
  const path = await ensureMarkdownExtension(selectedPath, defaultNewDocumentExtension);

  return saveActiveMarkdownDocumentToNewPath(documentKey, activeDocumentGeneration, path);
};

const saveActiveMarkdownDocumentToNewPath = async (
  documentKey: string,
  activeDocumentGeneration: number,
  path: string,
): Promise<boolean> => {
  const latestDocument = getActiveDocumentByKey(documentKey, activeDocumentGeneration);

  if (!latestDocument) {
    return false;
  }

  const serializedDocument = serializeActiveDocumentForSave(latestDocument);
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

    return handleUnrepresentableCharacters(error, documentKey, activeDocumentGeneration, () =>
      saveActiveMarkdownDocumentToNewPath(documentKey, activeDocumentGeneration, path),
    );
  }

  const existingFolderContext = useSessionStore.getState().folderContext;
  const nextFolderContext = await getFolderContextAfterSaveAs(
    result.path,
    result.parentFolderPath,
    existingFolderContext,
  );

  if (!getActiveDocumentByKey(documentKey, activeDocumentGeneration)) {
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

  if (nextFolderContext) {
    useSessionStore.getState().setActiveDocumentSession(nextFolderContext, savedDocument);
  } else {
    useSessionStore.getState().setActiveDocument(savedDocument);
  }

  return true;
};

const serializeActiveDocumentForSave = (
  activeDocument: ActiveDocumentState,
): SerializedDocumentForSave => {
  const { defaultNewDocumentLineEnding, insertFinalNewline } = useSettingsStore.getState();
  const lineEnding = activeDocument.lineEnding ?? defaultNewDocumentLineEnding;
  const documentKey = getActiveDocumentKey(activeDocument);
  const markdown = documentEditorBridge.getMarkdown(documentKey) ?? activeDocument.content;

  return {
    content: formatMarkdownForSave(markdown, lineEnding, insertFinalNewline),
    lineEnding,
    encoding: activeDocument.encoding,
  };
};

const saveExistingMarkdownDocument = async (
  activeDocument: SavedDocumentState,
  serializedDocument: SerializedDocumentForSave,
  activeDocumentGeneration: number,
  overwrite = false,
): Promise<boolean> => {
  try {
    const result = await saveMarkdownDocument(
      activeDocument.path,
      serializedDocument.content,
      serializedDocument.encoding,
      {
        expectedMetadata: activeDocument.metadata,
        overwrite,
      },
    );

    if (!getActiveDocumentByKey(getActiveDocumentKey(activeDocument), activeDocumentGeneration)) {
      return false;
    }

    useSessionStore.getState().setActiveDocument(
      toSavedDocument({
        path: result.path,
        content: serializedDocument.content,
        lineEnding: serializedDocument.lineEnding,
        encoding: serializedDocument.encoding,
        metadata: result.metadata,
        fingerprint: result.fingerprint,
      }),
    );

    return true;
  } catch (error) {
    if (isMissingFileSaveError(error)) {
      if (!getActiveDocumentByKey(getActiveDocumentKey(activeDocument), activeDocumentGeneration)) {
        return false;
      }

      return handleMissingSavedFile(getActiveDocumentKey(activeDocument), activeDocumentGeneration);
    }

    if (isExternalModificationSaveError(error)) {
      if (!getActiveDocumentByKey(getActiveDocumentKey(activeDocument), activeDocumentGeneration)) {
        return false;
      }

      return handleExternalModification(activeDocument, activeDocumentGeneration);
    }

    if (isUnrepresentableCharactersError(error)) {
      const documentKey = getActiveDocumentKey(activeDocument);

      return handleUnrepresentableCharacters(error, documentKey, activeDocumentGeneration, () => {
        const latestDocument = getActiveDocumentByKey(documentKey, activeDocumentGeneration);

        if (latestDocument?.status !== "saved") {
          return Promise.resolve(false);
        }

        return saveExistingMarkdownDocument(
          latestDocument,
          serializeActiveDocumentForSave(latestDocument),
          activeDocumentGeneration,
          overwrite,
        );
      });
    }

    throw error;
  }
};

const handleUnrepresentableCharacters = async (
  error: UnrepresentableCharactersError,
  documentKey: string,
  activeDocumentGeneration: number,
  saveAgain: () => Promise<boolean>,
) => {
  if (!getActiveDocumentByKey(documentKey, activeDocumentGeneration)) {
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

  if (!shouldConvert || !getActiveDocumentByKey(documentKey, activeDocumentGeneration)) {
    return false;
  }

  useSessionStore.getState().setActiveDocumentEncoding(documentKey, UTF8_ENCODING);

  return saveAgain();
};

const handleMissingSavedFile = async (documentKey: string, activeDocumentGeneration: number) => {
  const shouldSaveAs = await requestConfirmation({
    title: t("session.missingSavedFile.title"),
    message: t("session.missingSavedFile.message"),
    confirmLabel: t("session.missingSavedFile.confirm"),
    cancelLabel: t("session.missingSavedFile.cancel"),
  });

  if (!getActiveDocumentByKey(documentKey, activeDocumentGeneration)) {
    return false;
  }

  if (!shouldSaveAs) {
    return false;
  }

  return saveActiveMarkdownDocumentAsNow();
};

const handleExternalModification = async (
  activeDocument: SavedDocumentState,
  activeDocumentGeneration: number,
) => {
  const shouldOverwrite = await requestConfirmation({
    title: t("session.externalModification.title"),
    message: t("session.externalModification.message"),
    confirmLabel: t("session.externalModification.confirm"),
    cancelLabel: t("session.externalModification.cancel"),
  });

  if (!shouldOverwrite) {
    return false;
  }

  const latestDocument = getActiveDocumentByKey(activeDocument.path, activeDocumentGeneration);

  if (
    latestDocument?.status !== "saved" ||
    !matchesActiveDocumentKey(latestDocument, activeDocument.path)
  ) {
    return false;
  }

  return saveExistingMarkdownDocument(
    latestDocument,
    serializeActiveDocumentForSave(latestDocument),
    activeDocumentGeneration,
    true,
  );
};

const isMissingFileSaveError = (error: unknown) =>
  isSaveMarkdownFileError(error) && error.kind === "missingFile";

const isExternalModificationSaveError = (error: unknown) =>
  isSaveMarkdownFileError(error) && error.kind === "externalModification";

const getActiveDocumentByKey = (documentKey: string, activeDocumentGeneration: number) => {
  const session = useSessionStore.getState();
  const activeDocument = session.activeDocument;

  if (
    !activeDocument ||
    session.activeDocumentGeneration !== activeDocumentGeneration ||
    !matchesActiveDocumentKey(activeDocument, documentKey)
  ) {
    return null;
  }

  return activeDocument;
};

const getSaveAsDefaultPath = async (activeDocument: ActiveDocumentState) => {
  if (activeDocument.status === "saved") {
    return activeDocument.path;
  }

  const fileName = `${t("session.untitledFileName")}${useSettingsStore.getState().defaultNewDocumentExtension}`;
  const folderPath = useSessionStore.getState().folderContext?.path ?? (await documentDir());

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
