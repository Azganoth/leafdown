import { extname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

import {
  startDiagnosticOperationTimer,
  writeDiagnosticOperationFailure,
  writeDiagnosticSlowOperation,
} from "@/features/diagnostics";
import { CancellationToken, raceWithCancellation } from "@/lib/cancellation";
import { t } from "@/lib/i18n";

import type { TextEncodingName, DocumentEncoding } from "../utils/documentEncoding";
import {
  isInspectMarkdownFileError,
  isOpenMarkdownFileError,
  isSaveMarkdownFileError,
  type InspectMarkdownFileError,
  type OpenMarkdownFileError,
  type SaveMarkdownFileError,
} from "../utils/documentErrors";
import type { FileMetadataSnapshot, SavedDocumentState } from "../utils/documentState";
import {
  inspectMarkdownFile,
  MARKDOWN_FILE_EXTENSIONS,
  openMarkdownFile,
  saveMarkdownFile,
  writeHtmlExport,
  type NewDocumentExtension,
  type OpenMarkdownFileResult,
  type SaveMarkdownFileResult,
} from "./markdownDocumentApi";

export {
  MARKDOWN_FILE_EXTENSIONS,
  NEW_DOCUMENT_EXTENSIONS,
  type NewDocumentExtension,
  type MarkdownFileState,
} from "./markdownDocumentApi";
export type OpenedMarkdownDocument = OpenMarkdownFileResult;
export type SavedMarkdownDocument = SaveMarkdownFileResult;

export interface WriteMarkdownDocumentOptions {
  expectedMetadata?: FileMetadataSnapshot | null;
  overwrite?: boolean;
}

const MARKDOWN_FILTERS = [{ name: "Markdown", extensions: [...MARKDOWN_FILE_EXTENSIONS] }];
const HTML_FILTERS = [{ name: "HTML", extensions: ["html", "htm"] }];
const HTML_EXTENSION = ".html";

export const selectMarkdownFilePath = async () => {
  const selectedPath = await open({
    directory: false,
    filters: MARKDOWN_FILTERS,
    multiple: false,
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return null;
  }

  return selectedPath;
};

export const selectMarkdownSavePath = (defaultPath: string) =>
  save({
    title: t("document.saveDialog.title"),
    filters: MARKDOWN_FILTERS,
    defaultPath,
  });

export const openMarkdownDocument = async (
  path: string,
  cancellationToken: CancellationToken = CancellationToken.None,
  encoding: TextEncodingName | null = null,
) => {
  const startedAtMs = startDiagnosticOperationTimer();

  try {
    const document = await raceWithCancellation(cancellationToken, () =>
      openMarkdownFile({ path, encoding }),
    );

    writeDocumentOperationTimingDiagnostic("openMarkdownDocument", startedAtMs, {
      outcome: "succeeded",
      path: document.path,
      sizeBytes: document.metadata.sizeBytes,
    });

    return document;
  } catch (error) {
    if (isOpenMarkdownFileError(error)) {
      writeDocumentOperationFailureDiagnostic("openMarkdownDocument", error);
      writeDocumentOperationTimingDiagnostic("openMarkdownDocument", startedAtMs, {
        errorKind: error.kind,
        outcome: "failed",
        path: error.path,
      });
    }

    throw error;
  }
};

export const saveMarkdownDocument = async (
  path: string,
  content: string,
  encoding: DocumentEncoding,
  options: WriteMarkdownDocumentOptions = {},
) => {
  const expectedMetadata = options.expectedMetadata ?? null;
  const overwrite = options.overwrite ?? false;
  const startedAtMs = startDiagnosticOperationTimer();

  try {
    const savedDocument = await saveMarkdownFile({
      path,
      content,
      encoding,
      expectedMetadata,
      overwrite,
    });

    writeDocumentOperationTimingDiagnostic("saveMarkdownDocument", startedAtMs, {
      hasExpectedMetadata: expectedMetadata !== null,
      outcome: "succeeded",
      overwrite,
      path: savedDocument.path,
      sizeBytes: savedDocument.metadata.sizeBytes,
    });

    return savedDocument;
  } catch (error) {
    if (isSaveMarkdownFileError(error)) {
      writeDocumentOperationFailureDiagnostic("saveMarkdownDocument", error, {
        hasExpectedMetadata: expectedMetadata !== null,
        overwrite,
      });
      writeDocumentOperationTimingDiagnostic("saveMarkdownDocument", startedAtMs, {
        errorKind: error.kind,
        hasExpectedMetadata: expectedMetadata !== null,
        outcome: "failed",
        overwrite,
        path: error.path,
      });
    }

    throw error;
  }
};

export const inspectMarkdownDocument = async (
  { fingerprint, metadata, path }: Pick<SavedDocumentState, "fingerprint" | "metadata" | "path">,
  cancellationToken: CancellationToken = CancellationToken.None,
) => {
  try {
    return await raceWithCancellation(cancellationToken, () =>
      inspectMarkdownFile({ fingerprint, metadata, path }),
    );
  } catch (error) {
    if (isInspectMarkdownFileError(error)) {
      writeDocumentOperationFailureDiagnostic("inspectMarkdownDocument", error);
    }

    throw error;
  }
};

export const selectHtmlExportPath = (defaultPath: string) =>
  save({
    title: t("document.exportDialog.title"),
    filters: HTML_FILTERS,
    defaultPath,
  });

export const ensureHtmlExtension = async (path: string) =>
  (await extname(path)) ? path : `${path}${HTML_EXTENSION}`;

export const writeHtmlDocument = (
  path: string,
  content: string,
  sourceDocumentPath: string | null,
) => writeHtmlExport({ path, content, sourceDocumentPath });

export const ensureMarkdownExtension = async (
  path: string,
  defaultExtension: NewDocumentExtension,
) => ((await extname(path)) ? path : `${path}${defaultExtension}`);

const writeDocumentOperationFailureDiagnostic = (
  operation: "inspectMarkdownDocument" | "openMarkdownDocument" | "saveMarkdownDocument",
  error: InspectMarkdownFileError | OpenMarkdownFileError | SaveMarkdownFileError,
  context: Record<string, boolean> = {},
) => {
  void writeDiagnosticOperationFailure({
    context: {
      ...context,
      errorKind: error.kind,
      path: error.path,
    },
    feature: "document",
    operation,
  });
};

const writeDocumentOperationTimingDiagnostic = (
  operation: "openMarkdownDocument" | "saveMarkdownDocument",
  startedAtMs: number,
  context: Record<string, boolean | number | string | undefined>,
) => {
  writeDiagnosticSlowOperation({
    context,
    feature: "document",
    operation,
    startedAtMs,
  });
};
