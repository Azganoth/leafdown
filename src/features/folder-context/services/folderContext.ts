import { open } from "@tauri-apps/plugin-dialog";

import { writeDiagnosticWarn } from "@/features/diagnostics";
import { isOpenMarkdownFileError, type OpenMarkdownFileError } from "@/features/document";
import { CancellationToken, isCancellationError, raceWithCancellation } from "@/lib/cancellation";

import {
  isOpenFolderContextError,
  isScanFolderContextError,
  type OpenFolderContextError,
  type ScanFolderContextError,
} from "../utils/folderContextErrors";
import {
  openMarkdownFolder,
  scanMarkdownFolder,
  type ArticleSortOrder,
  type ArticleTree,
  type FolderIndexDocument,
  type ScanMarkdownFolderResult,
  type ScanMarkdownFolderWarning,
} from "./folderContextApi";

export interface FolderContextState {
  path: string;
  tree: ArticleTree;
  isEmpty: boolean;
  warnings: ScanMarkdownFolderWarning[];
}

export interface FolderContextScanOptions {
  ignoredDirectories: string[];
  sortOrder: ArticleSortOrder;
}

export interface OpenFolderContextOptions extends FolderContextScanOptions {
  indexFileNames: string[];
}

export interface OpenedFolderContext {
  folderContext: FolderContextState;
  indexDocument: FolderIndexDocument | null;
  indexError: OpenMarkdownFileError | null;
}

export type {
  ArticleSortOrder,
  ArticleTree,
  ArticleTreeNode,
  FolderIndexDocument,
  ScanMarkdownFolderWarning,
} from "./folderContextApi";

const toFolderContext = (folder: ScanMarkdownFolderResult): FolderContextState => ({
  path: folder.path,
  tree: folder.tree,
  isEmpty: folder.isEmpty,
  warnings: folder.warnings,
});

export const selectFolderContextPath = async () => {
  const selectedPath = await open({
    directory: true,
    multiple: false,
  });

  if (!selectedPath || Array.isArray(selectedPath)) {
    return null;
  }

  return selectedPath;
};

export const scanFolderContext = async (
  path: string,
  { ignoredDirectories, sortOrder }: FolderContextScanOptions,
  cancellationToken: CancellationToken = CancellationToken.None,
) => {
  try {
    const folder = await raceWithCancellation(cancellationToken, () =>
      scanMarkdownFolder({
        path,
        ignoredDirectories,
        sortOrder,
      }),
    );

    writeFolderScanWarningsDiagnostic("scanFolderContext", folder);

    return toFolderContext(folder);
  } catch (error) {
    if (!isCancellationError(error) && isScanFolderContextError(error)) {
      writeFolderOperationFailureDiagnostic("scanFolderContext", error);
    }

    throw error;
  }
};

export const openFolderContext = async (
  path: string,
  { ignoredDirectories, indexFileNames, sortOrder }: OpenFolderContextOptions,
  cancellationToken: CancellationToken = CancellationToken.None,
): Promise<OpenedFolderContext> => {
  try {
    const result = await raceWithCancellation(cancellationToken, () =>
      openMarkdownFolder({
        path,
        ignoredDirectories,
        indexFileNames,
        sortOrder,
      }),
    );

    writeFolderScanWarningsDiagnostic("openFolderContext", result.folder);
    writeFolderIndexFailureDiagnostic(result.indexError);

    return {
      folderContext: toFolderContext(result.folder),
      indexDocument: result.indexDocument,
      indexError: result.indexError,
    };
  } catch (error) {
    if (!isCancellationError(error) && isOpenFolderContextError(error)) {
      writeFolderOperationFailureDiagnostic("openFolderContext", error);
    }

    throw error;
  }
};

const writeFolderOperationFailureDiagnostic = (
  operation: "openFolderContext" | "scanFolderContext",
  error: OpenFolderContextError | ScanFolderContextError,
) => {
  const scanError = error.kind === "scanFailed" ? error.error : error;

  void writeDiagnosticWarn({
    causeKind: error.kind === "scanFailed" ? scanError.kind : undefined,
    errorKind: error.kind,
    event: "operationFailed",
    feature: "folder-context",
    operation,
    path: scanError.path,
  });
};

const writeFolderScanWarningsDiagnostic = (
  operation: "openFolderContext" | "scanFolderContext",
  folder: ScanMarkdownFolderResult,
) => {
  if (folder.warnings.length === 0) {
    return;
  }

  void writeDiagnosticWarn({
    event: "operationWarning",
    feature: "folder-context",
    operation,
    path: folder.path,
    warningCount: folder.warnings.length,
    warningKind: "scanWarnings",
    warningKinds: countScanWarningKinds(folder.warnings),
  });
};

const writeFolderIndexFailureDiagnostic = (error: OpenMarkdownFileError | null) => {
  if (!isOpenMarkdownFileError(error)) {
    return;
  }

  void writeDiagnosticWarn({
    errorKind: error.kind,
    event: "operationWarning",
    feature: "folder-context",
    operation: "openFolderContext",
    path: error.path,
    warningKind: "indexDocumentOpenFailed",
  });
};

const countScanWarningKinds = (warnings: ScanMarkdownFolderWarning[]) =>
  warnings.reduce<Record<string, number>>((counts, warning) => {
    counts[warning.kind] = (counts[warning.kind] ?? 0) + 1;

    return counts;
  }, {});
