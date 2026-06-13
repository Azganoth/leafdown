import { describe, expect, it, vi } from "vitest";

import { invoke } from "@tauri-apps/api/core";
import { unwatchFolderContext, watchFolderContext } from "./folderContextWatcher";

describe("folder context watcher backend", () => {
  it("starts the native watcher for a Markdown folder context", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await watchFolderContext("C:/Notes", [".git", "node_modules"], "scope:1", 1);

    expect(invoke).toHaveBeenCalledWith("watch_markdown_folder", {
      path: "C:/Notes",
      ignoredDirectories: [".git", "node_modules"],
      scopeId: "scope:1",
      scopeGeneration: 1,
    });
  });

  it("stops the active native watcher", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);

    await unwatchFolderContext("scope:1", 1);

    expect(invoke).toHaveBeenCalledWith("unwatch_markdown_folder", {
      scopeId: "scope:1",
      scopeGeneration: 1,
    });
  });
});
