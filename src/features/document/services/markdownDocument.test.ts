import { warn as writeLogWarn } from "@tauri-apps/plugin-log";
import { describe, expect, it, vi } from "vitest";

import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";
import { mockTauriApi } from "@/test/utils/tauriApi";

import { openMarkdownDocument, saveMarkdownDocument } from "./markdownDocument";

describe("markdown document service", () => {
  it("logs expected open failures without document content", async () => {
    mockTauriApi({
      getDiagnosticsRuntime: () => ({ runId: "run-test" }),
      openMarkdownFile: () =>
        Promise.reject({
          kind: "missingFile",
          path: TEST_MARKDOWN_FILE_PATH,
        }),
    });

    await expect(openMarkdownDocument(TEST_MARKDOWN_FILE_PATH)).rejects.toMatchObject({
      kind: "missingFile",
    });

    await expect
      .poll(() => vi.mocked(writeLogWarn).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"operation":"openMarkdownDocument"');

    const payload = JSON.parse(vi.mocked(writeLogWarn).mock.calls.at(-1)?.[0] ?? "{}") as {
      errorKind: string;
      event: string;
      feature: string;
      operation: string;
      path: string;
    };

    expect(payload).toMatchObject({
      errorKind: "missingFile",
      event: "operationFailed",
      feature: "document",
      operation: "openMarkdownDocument",
      path: TEST_MARKDOWN_FILE_PATH,
    });
  });

  it("logs expected save failures without the markdown content", async () => {
    mockTauriApi({
      getDiagnosticsRuntime: () => ({ runId: "run-test" }),
      saveMarkdownFile: () =>
        Promise.reject({
          kind: "writeFailed",
          message: "disk full",
          path: TEST_MARKDOWN_FILE_PATH,
        }),
    });

    await expect(
      saveMarkdownDocument(TEST_MARKDOWN_FILE_PATH, "# Sensitive draft", {
        overwrite: true,
      }),
    ).rejects.toMatchObject({
      kind: "writeFailed",
    });

    await expect
      .poll(() => vi.mocked(writeLogWarn).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"operation":"saveMarkdownDocument"');

    const logMessage = vi.mocked(writeLogWarn).mock.calls.at(-1)?.[0] ?? "{}";
    const payload = JSON.parse(logMessage) as {
      errorKind: string;
      event: string;
      feature: string;
      hasExpectedMetadata: boolean;
      operation: string;
      overwrite: boolean;
      path: string;
    };

    expect(logMessage).not.toContain("Sensitive draft");
    expect(payload).toMatchObject({
      errorKind: "writeFailed",
      event: "operationFailed",
      feature: "document",
      hasExpectedMetadata: false,
      operation: "saveMarkdownDocument",
      overwrite: true,
      path: TEST_MARKDOWN_FILE_PATH,
    });
  });
});
