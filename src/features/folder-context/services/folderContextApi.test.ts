import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  OPEN_MARKDOWN_FOLDER_COMMAND,
  openMarkdownFolder,
  SCAN_MARKDOWN_FOLDER_COMMAND,
  scanMarkdownFolder,
  UNWATCH_MARKDOWN_FOLDER_COMMAND,
  unwatchMarkdownFolder,
  WATCH_MARKDOWN_FOLDER_COMMAND,
  watchMarkdownFolder,
  type OpenMarkdownFolderResult,
  type ScanMarkdownFolderResult,
} from "./folderContextApi";

describe("folderContextApi", () => {
  it("invokes the scan Markdown folder command", async () => {
    const result = {
      path: "C:/Notes",
      tree: {
        name: "Notes",
        path: "C:/Notes",
        children: [],
      },
      isEmpty: true,
      warnings: [],
    } satisfies ScanMarkdownFolderResult;
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(
      scanMarkdownFolder({
        path: result.path,
        ignoredDirectories: [".git"],
        sortOrder: "name",
      }),
    ).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(SCAN_MARKDOWN_FOLDER_COMMAND, {
      path: result.path,
      ignoredDirectories: [".git"],
      sortOrder: "name",
    });
  });

  it("invokes the open Markdown folder command", async () => {
    const result = {
      folder: {
        path: "C:/Notes",
        tree: {
          name: "Notes",
          path: "C:/Notes",
          children: [],
        },
        isEmpty: false,
        warnings: [],
      },
      indexDocument: null,
      indexError: null,
    } satisfies OpenMarkdownFolderResult;
    vi.mocked(invoke).mockResolvedValueOnce(result);

    await expect(
      openMarkdownFolder({
        path: result.folder.path,
        ignoredDirectories: [".git"],
        indexFileNames: ["index.md"],
        sortOrder: "modifiedDate",
      }),
    ).resolves.toBe(result);

    expect(invoke).toHaveBeenCalledWith(OPEN_MARKDOWN_FOLDER_COMMAND, {
      path: result.folder.path,
      ignoredDirectories: [".git"],
      indexFileNames: ["index.md"],
      sortOrder: "modifiedDate",
    });
  });

  it("invokes the watch Markdown folder command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await watchMarkdownFolder({
      path: "C:/Notes",
      ignoredDirectories: ["node_modules"],
      scopeId: "scope:1",
      scopeGeneration: 1,
    });

    expect(invoke).toHaveBeenCalledWith(WATCH_MARKDOWN_FOLDER_COMMAND, {
      path: "C:/Notes",
      ignoredDirectories: ["node_modules"],
      scopeId: "scope:1",
      scopeGeneration: 1,
    });
  });

  it("invokes the unwatch Markdown folder command", async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    await unwatchMarkdownFolder({
      scopeId: "scope:1",
      scopeGeneration: 1,
    });

    expect(invoke).toHaveBeenCalledWith(UNWATCH_MARKDOWN_FOLDER_COMMAND, {
      scopeId: "scope:1",
      scopeGeneration: 1,
    });
  });
});
