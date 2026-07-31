import { open } from "@tauri-apps/plugin-dialog";

import {
  startDiagnosticOperationTimer,
  writeDiagnosticOperationFailure,
  writeDiagnosticOperationWarning,
  writeDiagnosticSlowOperation,
} from "@/features/diagnostics";
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

type FolderContextOperation = "openFolderContext" | "scanFolderContext";

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
  const startedAtMs = startDiagnosticOperationTimer();

  try {
    const folder = await raceWithCancellation(cancellationToken, () =>
      scanMarkdownFolder({
        path,
        ignoredDirectories,
        sortOrder,
      }),
    );

    writeFolderScanWarningsDiagnostic("scanFolderContext", folder);
    writeFolderOperationTimingDiagnostic("scanFolderContext", startedAtMs, {
      ...getFolderScanDiagnosticContext(folder),
      outcome: "succeeded",
    });

    return toFolderContext(folder);
  } catch (error) {
    if (!isCancellationError(error) && isScanFolderContextError(error)) {
      writeFolderOperationFailureDiagnostic("scanFolderContext", error);
      writeFolderOperationTimingDiagnostic("scanFolderContext", startedAtMs, {
        errorKind: error.kind,
        outcome: "failed",
        path: error.path,
      });
    }

    throw error;
  }
};

export const openFolderContext = async (
  path: string,
  { ignoredDirectories, indexFileNames, sortOrder }: OpenFolderContextOptions,
  cancellationToken: CancellationToken = CancellationToken.None,
): Promise<OpenedFolderContext> => {
  const startedAtMs = startDiagnosticOperationTimer();

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
    writeFolderOperationTimingDiagnostic("openFolderContext", startedAtMs, {
      ...getFolderScanDiagnosticContext(result.folder),
      hasIndexDocument: result.indexDocument !== null,
      hasIndexError: result.indexError !== null,
      outcome: "succeeded",
    });

    return {
      folderContext: toFolderContext(result.folder),
      indexDocument: result.indexDocument,
      indexError: result.indexError,
    };
  } catch (error) {
    if (!isCancellationError(error) && isOpenFolderContextError(error)) {
      const scanError = error.error;

      writeFolderOperationFailureDiagnostic("openFolderContext", error);
      writeFolderOperationTimingDiagnostic("openFolderContext", startedAtMs, {
        causeKind: scanError.kind,
        errorKind: error.kind,
        outcome: "failed",
        path: scanError.path,
      });
    }

    throw error;
  }
};

const writeFolderOperationFailureDiagnostic = (
  operation: FolderContextOperation,
  error: OpenFolderContextError | ScanFolderContextError,
) => {
  const scanError = error.kind === "scanFailed" ? error.error : error;

  void writeDiagnosticOperationFailure({
    context: {
      causeKind: error.kind === "scanFailed" ? scanError.kind : undefined,
      errorKind: error.kind,
      path: scanError.path,
    },
    feature: "folder-context",
    operation,
  });
};

const writeFolderScanWarningsDiagnostic = (
  operation: FolderContextOperation,
  folder: ScanMarkdownFolderResult,
) => {
  if (folder.warnings.length === 0) {
    return;
  }

  void writeDiagnosticOperationWarning({
    context: {
      path: folder.path,
      warningCount: folder.warnings.length,
      warningKind: "scanWarnings",
      warningKinds: countScanWarningKinds(folder.warnings),
    },
    feature: "folder-context",
    operation,
  });
};

const writeFolderIndexFailureDiagnostic = (error: OpenMarkdownFileError | null) => {
  if (!isOpenMarkdownFileError(error)) {
    return;
  }

  void writeDiagnosticOperationWarning({
    context: {
      errorKind: error.kind,
      path: error.path,
      warningKind: "indexDocumentOpenFailed",
    },
    feature: "folder-context",
    operation: "openFolderContext",
  });
};

const writeFolderOperationTimingDiagnostic = (
  operation: FolderContextOperation,
  startedAtMs: number,
  context: Record<string, boolean | number | string | undefined>,
) => {
  writeDiagnosticSlowOperation({
    context,
    feature: "folder-context",
    operation,
    startedAtMs,
  });
};

const getFolderScanDiagnosticContext = (folder: ScanMarkdownFolderResult) => ({
  articleCount: countArticleTreeFiles(folder.tree),
  isEmpty: folder.isEmpty,
  path: folder.path,
  warningCount: folder.warnings.length,
});

const countArticleTreeFiles = (tree: ArticleTree): number =>
  tree.children.reduce(
    (count, node) => count + (node.kind === "file" ? 1 : countArticleTreeFiles(node)),
    0,
  );

const countScanWarningKinds = (warnings: ScanMarkdownFolderWarning[]) =>
  warnings.reduce<Record<string, number>>((counts, warning) => {
    counts[warning.kind] = (counts[warning.kind] ?? 0) + 1;

    return counts;
  }, {});
