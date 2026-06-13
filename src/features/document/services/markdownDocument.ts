import { invoke } from "@tauri-apps/api/core";
import { extname } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";

import type {
  OpenedMarkdownDocument,
  SavedMarkdownDocument,
  WriteMarkdownDocumentOptions,
} from "../types";

const markdownFilters = [{ name: "Markdown", extensions: ["md", "markdown"] }];

export const selectMarkdownFilePath = async () => {
  const selectedPath = await open({
    directory: false,
    filters: markdownFilters,
    multiple: false,
  });

  return selectedPath && !Array.isArray(selectedPath) ? selectedPath : null;
};

export const selectMarkdownSavePath = async (defaultPath: string) =>
  save({
    title: "Save Markdown document",
    filters: markdownFilters,
    defaultPath,
  });

export const openMarkdownDocument = (path: string) =>
  invoke<OpenedMarkdownDocument>("open_markdown_file", { path });

export const saveMarkdownDocument = (
  path: string,
  content: string,
  options: WriteMarkdownDocumentOptions = {},
) =>
  invoke<SavedMarkdownDocument>("save_markdown_file", {
    path,
    content,
    expectedMetadata: options.expectedMetadata ?? null,
    overwrite: options.overwrite ?? false,
  });

export const ensureMarkdownExtension = async (
  path: string,
  defaultExtension: ".md" | ".markdown",
) => ((await extname(path)) ? path : `${path}${defaultExtension}`);
