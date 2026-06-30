import { extname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

import { CancellationToken, raceWithCancellation } from "@/lib/cancellation";

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
) => raceWithCancellation(cancellationToken, () => openMarkdownFile({ path }));

export const saveMarkdownDocument = (
  path: string,
  content: string,
  options: WriteMarkdownDocumentOptions = {},
) =>
  saveMarkdownFile({
    path,
    content,
    expectedMetadata: options.expectedMetadata ?? null,
    overwrite: options.overwrite ?? false,
  });

export const ensureMarkdownExtension = async (
  path: string,
  defaultExtension: MarkdownFileExtension,
) => ((await extname(path)) ? path : `${path}${defaultExtension}`);
