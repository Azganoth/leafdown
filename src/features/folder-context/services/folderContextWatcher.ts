import { invoke } from "@tauri-apps/api/core";

export const watchFolderContext = async (
  path: string,
  ignoredDirectories: string[],
  scopeId: string,
  scopeGeneration: number,
) => {
  await invoke("watch_markdown_folder", {
    path,
    ignoredDirectories,
    scopeId,
    scopeGeneration,
  });
};

export const unwatchFolderContext = async (scopeId: string, scopeGeneration: number) => {
  await invoke("unwatch_markdown_folder", {
    scopeId,
    scopeGeneration,
  });
};
