import { extname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

import { writeDiagnosticWarn } from "@/features/diagnostics";
import { CancellationToken, raceWithCancellation } from "@/lib/cancellation";

import {
  isOpenMarkdownFileError,
  isSaveMarkdownFileError,
  type OpenMarkdownFileError,
  type SaveMarkdownFileError,
} from "../utils/documentErrors";
import type { FileMetadataSnapshot } from "../utils/documentState";
import {
  MARKDOWN_FILE_EXTENSIONS,
  openMarkdownFile,
  saveMarkdownFile,
  type MarkdownFileExtension,
  type OpenMarkdownFileResult,
  type SaveMarkdownFileResult,
} from "./markdownDocumentApi";

export { MARKDOWN_FILE_EXTENSIONS, type MarkdownFileExtension } from "./markdownDocumentApi";
export type OpenedMarkdownDocument = OpenMarkdownFileResult;
export type SavedMarkdownDocument = SaveMarkdownFileResult;

export interface WriteMarkdownDocumentOptions {
  expectedMetadata?: FileMetadataSnapshot | null;
  overwrite?: boolean;
}

const MARKDOWN_FILTERS = [{ name: "Markdown", extensions: [...MARKDOWN_FILE_EXTENSIONS] }];

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
    title: "Save Markdown document",
    filters: MARKDOWN_FILTERS,
    defaultPath,
  });

export const openMarkdownDocument = async (
  path: string,
  cancellationToken: CancellationToken = CancellationToken.None,
) => {
  try {
    return await raceWithCancellation(cancellationToken, () => openMarkdownFile({ path }));
  } catch (error) {
    if (isOpenMarkdownFileError(error)) {
      writeDocumentOperationFailureDiagnostic("openMarkdownDocument", error);
    }

    throw error;
  }
};

export const saveMarkdownDocument = async (
  path: string,
  content: string,
  options: WriteMarkdownDocumentOptions = {},
) => {
  const expectedMetadata = options.expectedMetadata ?? null;
  const overwrite = options.overwrite ?? false;

  try {
    return await saveMarkdownFile({
      path,
      content,
      expectedMetadata,
      overwrite,
    });
  } catch (error) {
    if (isSaveMarkdownFileError(error)) {
      writeDocumentOperationFailureDiagnostic("saveMarkdownDocument", error, {
        hasExpectedMetadata: expectedMetadata !== null,
        overwrite,
      });
    }

    throw error;
  }
};

export const ensureMarkdownExtension = async (
  path: string,
  defaultExtension: MarkdownFileExtension,
) => ((await extname(path)) ? path : `${path}${defaultExtension}`);

const writeDocumentOperationFailureDiagnostic = (
  operation: "openMarkdownDocument" | "saveMarkdownDocument",
  error: OpenMarkdownFileError | SaveMarkdownFileError,
  context: Record<string, boolean> = {},
) => {
  void writeDiagnosticWarn({
    ...context,
    errorKind: error.kind,
    event: "operationFailed",
    feature: "document",
    operation,
    path: error.path,
  });
};
