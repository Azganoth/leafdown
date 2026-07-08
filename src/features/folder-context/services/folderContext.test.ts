import { open } from "@tauri-apps/plugin-dialog";
import { info as writeLogInfo, warn as writeLogWarn } from "@tauri-apps/plugin-log";
import { describe, expect, it, vi } from "vitest";

import { SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS } from "@/features/diagnostics";
import {
  CancellationToken,
  CancellationTokenSource,
  isCancellationError,
} from "@/lib/cancellation";
import { createArticleTree, createNestedArticleTree } from "@/test/factories/folderContext";
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
    await expect
      .poll(() => vi.mocked(writeLogWarn).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"warningKind":"scanWarnings"');
    expect(getLastWarnPayload()).toMatchObject({
      event: "operationWarning",
      feature: "folder-context",
      operation: "scanFolderContext",
      path: TEST_NOTES_FOLDER_PATH,
      warningCount: 1,
      warningKind: "scanWarnings",
      warningKinds: {
        readDirectoryFailed: 1,
      },
    });
  });

  it("logs slow folder scan timing with article and warning counts", async () => {
    const result = {
      path: TEST_NOTES_FOLDER_PATH,
      tree: createNestedArticleTree(),
      isEmpty: false,
      warnings: [],
    } satisfies ScanMarkdownFolderResult;
    const performanceNow = mockSlowOperation();
    mockTauriApi({
      getDiagnosticsRuntime: () => ({ runId: "run-test" }),
      scanMarkdownFolder: () => result,
    });

    try {
      await expect(
        scanFolderContext(TEST_NOTES_FOLDER_PATH, {
          ignoredDirectories: [],
          sortOrder: "name",
        }),
      ).resolves.toMatchObject({
        path: TEST_NOTES_FOLDER_PATH,
        tree: result.tree,
      });
    } finally {
      performanceNow.mockRestore();
    }

    await expect
      .poll(() => vi.mocked(writeLogInfo).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"event":"operationTiming"');
    expect(getLastInfoPayload()).toMatchObject({
      articleCount: 3,
      durationMs: SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS + 25,
      event: "operationTiming",
      feature: "folder-context",
      isEmpty: false,
      operation: "scanFolderContext",
      outcome: "succeeded",
      path: TEST_NOTES_FOLDER_PATH,
      thresholdMs: SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
      warningCount: 0,
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

  it("logs expected folder scan failures", async () => {
    mockTauriApi({
      getDiagnosticsRuntime: () => ({ runId: "run-test" }),
      scanMarkdownFolder: () =>
        Promise.reject({
          kind: "readDirectoryFailed",
          message: "access denied",
          path: TEST_NOTES_FOLDER_PATH,
        }),
    });

    await expect(
      scanFolderContext(TEST_NOTES_FOLDER_PATH, {
        ignoredDirectories: [],
        sortOrder: "name",
      }),
    ).rejects.toMatchObject({
      kind: "readDirectoryFailed",
    });

    await expect
      .poll(() => vi.mocked(writeLogWarn).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"operation":"scanFolderContext"');
    expect(getLastWarnPayload()).toMatchObject({
      errorKind: "readDirectoryFailed",
      event: "operationFailed",
      feature: "folder-context",
      operation: "scanFolderContext",
      path: TEST_NOTES_FOLDER_PATH,
    });
  });

  it("logs index document failures while preserving the opened folder context", async () => {
    const result = {
      folder: {
        path: TEST_NOTES_FOLDER_PATH,
        tree: createArticleTree(),
        isEmpty: false,
        warnings: [],
      },
      indexDocument: null,
      indexError: {
        kind: "missingFile",
        path: TEST_MARKDOWN_FILE_PATH,
      },
    } satisfies OpenMarkdownFolderResult;
    mockTauriApi({
      getDiagnosticsRuntime: () => ({ runId: "run-test" }),
      openMarkdownFolder: () => result,
    });

    await expect(
      openFolderContext(TEST_NOTES_FOLDER_PATH, {
        ignoredDirectories: [],
        indexFileNames: ["README.md"],
        sortOrder: "name",
      }),
    ).resolves.toMatchObject({
      indexDocument: null,
      indexError: {
        kind: "missingFile",
        path: TEST_MARKDOWN_FILE_PATH,
      },
    });

    await expect
      .poll(() => vi.mocked(writeLogWarn).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"warningKind":"indexDocumentOpenFailed"');
    expect(getLastWarnPayload()).toMatchObject({
      errorKind: "missingFile",
      event: "operationWarning",
      feature: "folder-context",
      operation: "openFolderContext",
      path: TEST_MARKDOWN_FILE_PATH,
      warningKind: "indexDocumentOpenFailed",
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

const getLastWarnPayload = () =>
  JSON.parse(vi.mocked(writeLogWarn).mock.calls.at(-1)?.[0] ?? "{}") as Record<string, unknown>;

const getLastInfoPayload = () =>
  JSON.parse(vi.mocked(writeLogInfo).mock.calls.at(-1)?.[0] ?? "{}") as Record<string, unknown>;

const mockSlowOperation = () =>
  vi
    .spyOn(performance, "now")
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS + 25);
