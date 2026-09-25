import { writeDiagnosticOperationFailure } from "@/features/diagnostics";
import { isWindowsPlatform } from "@/lib/platform";

import { isFolderEntryError } from "../utils/folderContextErrors";
import {
  createArticleDirectory,
  createMarkdownArticle,
  renameFolderEntry,
  trashFolderEntry,
  type CreateArticleDirectoryArgs,
  type CreateMarkdownArticleArgs,
  type RenameFolderEntryArgs,
  type TrashFolderEntryArgs,
} from "./folderContextApi";

type FolderEntryOperation =
  | "createFolderArticle"
  | "createFolderDirectory"
  | "renameFolderContextEntry"
  | "trashFolderContextEntry";

export const getTrashName = () => (isWindowsPlatform() ? "Recycle Bin" : "Trash");

export const createFolderArticle = async (args: CreateMarkdownArticleArgs) =>
  (await withFailureDiagnostic("createFolderArticle", () => createMarkdownArticle(args))).path;

export const createFolderDirectory = async (args: CreateArticleDirectoryArgs) =>
  (await withFailureDiagnostic("createFolderDirectory", () => createArticleDirectory(args))).path;

export const renameFolderContextEntry = async (args: RenameFolderEntryArgs) =>
  (await withFailureDiagnostic("renameFolderContextEntry", () => renameFolderEntry(args))).path;

export const trashFolderContextEntry = (args: TrashFolderEntryArgs) =>
  withFailureDiagnostic("trashFolderContextEntry", () => trashFolderEntry(args));

const withFailureDiagnostic = async <T>(
  operation: FolderEntryOperation,
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (isFolderEntryError(error) && error.kind !== "invalidName") {
      void writeDiagnosticOperationFailure({
        context: {
          errorKind: error.kind,
          path: "path" in error ? error.path : undefined,
        },
        feature: "folder-context",
        operation,
      });
    }

    throw error;
  }
};
