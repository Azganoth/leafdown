import { documentDir, join } from "@tauri-apps/api/path";

import {
  ensureHtmlExtension,
  getActiveDocumentKey,
  MARKDOWN_FILE_EXTENSIONS,
  matchesActiveDocumentKey,
  selectHtmlExportPath,
  writeHtmlDocument,
  type ActiveDocumentState,
} from "@/features/document";
import { renderHtmlExport, type HtmlExportWarning } from "@/features/editor";
import { SequentialTaskQueue } from "@/lib/async";
import { t } from "@/lib/i18n";
import { getPathParts } from "@/lib/path";

import { getSessionFolderPath, useSessionStore } from "../stores/session";
import { documentEditorBridge } from "./documentEditorBridge";

export type HtmlExportOutcome =
  | { status: "cancelled" }
  | { status: "exported"; path: string; warnings: HtmlExportWarning[] };

export class HtmlExportUnavailableError extends Error {
  constructor() {
    super("The active document's editor is not ready to export.");
    this.name = "HtmlExportUnavailableError";
  }
}

const HTML_EXTENSION = ".html";
const MARKDOWN_EXTENSION_PATTERN = new RegExp(
  `\\.(?:${MARKDOWN_FILE_EXTENSIONS.join("|")})$`,
  "iu",
);

const exportTaskQueue = new SequentialTaskQueue();

const getDocumentTitle = (activeDocument: ActiveDocumentState) =>
  activeDocument.status === "saved"
    ? getPathParts(activeDocument.path).name.replace(MARKDOWN_EXTENSION_PATTERN, "")
    : t("session.untitledFileName");

const getExportDefaultPath = async (activeDocument: ActiveDocumentState) => {
  const fileName = `${getDocumentTitle(activeDocument)}${HTML_EXTENSION}`;
  const folderPath =
    activeDocument.status === "saved"
      ? getPathParts(activeDocument.path).parent
      : (getSessionFolderPath(useSessionStore.getState()) ?? (await documentDir()));

  return join(folderPath, fileName);
};

export const exportActiveMarkdownDocumentAsHtml = () =>
  exportTaskQueue.run(exportActiveMarkdownDocumentAsHtmlNow);

const exportActiveMarkdownDocumentAsHtmlNow = async (): Promise<HtmlExportOutcome> => {
  const { activeDocument, activeDocumentGeneration } = useSessionStore.getState();

  if (!activeDocument) {
    return { status: "cancelled" };
  }

  const documentKey = getActiveDocumentKey(activeDocument);
  const selectedPath = await selectHtmlExportPath(await getExportDefaultPath(activeDocument));
  const session = useSessionStore.getState();

  if (
    !selectedPath ||
    !session.activeDocument ||
    session.activeDocumentGeneration !== activeDocumentGeneration ||
    !matchesActiveDocumentKey(session.activeDocument, documentKey)
  ) {
    return { status: "cancelled" };
  }

  const snapshot = documentEditorBridge.getHtmlExportSnapshot(documentKey);

  if (!snapshot) {
    throw new HtmlExportUnavailableError();
  }

  const path = await ensureHtmlExtension(selectedPath);
  const documentPath = activeDocument.status === "saved" ? activeDocument.path : null;
  const { html, warnings } = await renderHtmlExport(snapshot, {
    documentPath,
    folderContextPath: getSessionFolderPath(session),
    outputPath: path,
    title: getDocumentTitle(activeDocument),
  });

  await writeHtmlDocument(path, html, documentPath);

  return { status: "exported", path, warnings };
};
