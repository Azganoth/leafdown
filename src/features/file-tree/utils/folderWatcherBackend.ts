import { invoke } from "@tauri-apps/api/core";

export const watchMarkdownFolder = async (path: string, ignoredDirectories: string[]) => {
  await invoke("watch_markdown_folder", {
    path,
    ignoredDirectories,
  });
};

export const unwatchMarkdownFolder = async () => {
  await invoke("unwatch_markdown_folder");
};
