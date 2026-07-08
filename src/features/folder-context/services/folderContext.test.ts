import { open } from "@tauri-apps/plugin-dialog";
import { describe, expect, it, vi } from "vitest";

import {
  CancellationToken,
  CancellationTokenSource,
  isCancellationError,
} from "@/lib/cancellation";
import { createArticleTree } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH, TEST_NOTES_FOLDER_PATH } from "@/test/fixtures/paths";
import { countTauriApiCalls, getLastTauriApiArgs, mockTauriApi } from "@/test/utils/tauriApi";

import { openFolderContext, scanFolderContext, selectFolderContextPath } from "./folderContext";
import type { OpenMarkdownFolderResult, ScanMarkdownFolderResult } from "./folderContextApi";

describe("folder context service", () => {
  it("returns a single selected folder path from the native dialog", async () => {
    vi.mocked(open).mockResolvedValueOnce(TEST_NOTES_FOLDER_PATH);

    await expect(selectFolderContextPath()).resolves.toBe(TEST_NOTES_FOLDER_PATH);

    expect(open).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    });
  });

  it("returns null when folder selection is cancelled or unexpected", async () => {
    vi.mocked(open).mockResolvedValueOnce(null).mockResolvedValueOnce([TEST_NOTES_FOLDER_PATH]);

    await expect(selectFolderContextPath()).resolves.toBeNull();
    await expect(selectFolderContextPath()).resolves.toBeNull();
  });

  it("scans folder contexts through the backend API", async () => {
    const result = {
      path: TEST_NOTES_FOLDER_PATH,
      tree: createArticleTree(),
      isEmpty: false,
      warnings: [
        {
          kind: "readDirectoryFailed",
          path: `${TEST_NOTES_FOLDER_PATH}/restricted`,
          message: "access denied",
        },
      ],
    } satisfies ScanMarkdownFolderResult;
    mockTauriApi({
      scanMarkdownFolder: () => result,
    });

    await expect(
      scanFolderContext(TEST_NOTES_FOLDER_PATH, {
        ignoredDirectories: [".git"],
        sortOrder: "type",
      }),
    ).resolves.toEqual({
      path: TEST_NOTES_FOLDER_PATH,
      tree: result.tree,
      isEmpty: false,
      warnings: result.warnings,
    });
    expect(getLastTauriApiArgs("scanMarkdownFolder")).toEqual({
      path: TEST_NOTES_FOLDER_PATH,
      ignoredDirectories: [".git"],
      sortOrder: "type",
    });
  });

  it("opens folder contexts and keeps the optional index document", async () => {
    const result = {
      folder: {
        path: TEST_NOTES_FOLDER_PATH,
        tree: createArticleTree(),
        isEmpty: false,
        warnings: [],
      },
      indexDocument: {
        path: TEST_MARKDOWN_FILE_PATH,
        content: "# Notes",
        lineEnding: "lf" as const,
        metadata: {
          modifiedAtUnixMs: 1_700_000_000_000,
          sizeBytes: 7,
        },
      },
      indexError: null,
    } satisfies OpenMarkdownFolderResult;
    mockTauriApi({
      openMarkdownFolder: () => result,
    });

    await expect(
      openFolderContext(TEST_NOTES_FOLDER_PATH, {
        ignoredDirectories: ["node_modules"],
        indexFileNames: ["README.md"],
        sortOrder: "modifiedDate",
      }),
    ).resolves.toEqual({
      folderContext: {
        path: TEST_NOTES_FOLDER_PATH,
        tree: result.folder.tree,
        isEmpty: false,
        warnings: [],
      },
      indexDocument: result.indexDocument,
      indexError: null,
    });
    expect(getLastTauriApiArgs("openMarkdownFolder")).toEqual({
      path: TEST_NOTES_FOLDER_PATH,
      ignoredDirectories: ["node_modules"],
      indexFileNames: ["README.md"],
      sortOrder: "modifiedDate",
    });
  });

  it("does not call the backend when a scan is already cancelled", async () => {
    mockTauriApi({
      scanMarkdownFolder: () => {
        throw new Error("scan should not start");
      },
    });

    const scan = scanFolderContext(
      TEST_NOTES_FOLDER_PATH,
      {
        ignoredDirectories: [],
        sortOrder: "name",
      },
      CancellationToken.Cancelled,
    );

    await expect(scan).rejects.toSatisfy(isCancellationError);
    expect(countTauriApiCalls("scanMarkdownFolder")).toBe(0);
  });

  it("rejects a pending folder open when cancellation is requested", async () => {
    const source = new CancellationTokenSource();
    const openedFolder = Promise.withResolvers<OpenMarkdownFolderResult>();
    mockTauriApi({
      openMarkdownFolder: () => openedFolder.promise,
    });

    const openFolder = openFolderContext(
      TEST_NOTES_FOLDER_PATH,
      {
        ignoredDirectories: [],
        indexFileNames: ["index.md"],
        sortOrder: "name",
      },
      source.token,
    );
    source.cancel();

    await expect(openFolder).rejects.toSatisfy(isCancellationError);
    expect(countTauriApiCalls("openMarkdownFolder")).toBe(1);
  });
});
