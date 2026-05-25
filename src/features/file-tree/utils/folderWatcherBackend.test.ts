import { describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";
import { unwatchMarkdownFolder, watchMarkdownFolder } from "./folderWatcherBackend";

describe("folderWatcherBackend", () => {
  it("starts the native watcher for a Markdown folder context", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await watchMarkdownFolder("C:/Notes", [".git", "node_modules"]);

    expect(invoke).toHaveBeenCalledWith("watch_markdown_folder", {
      path: "C:/Notes",
      ignoredDirectories: [".git", "node_modules"],
    });
  });

  it("stops the active native watcher", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await unwatchMarkdownFolder();

    expect(invoke).toHaveBeenCalledWith("unwatch_markdown_folder");
  });
});
