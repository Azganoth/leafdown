import { info as writeLogInfo, warn as writeLogWarn } from "@tauri-apps/plugin-log";
import { describe, expect, it, vi } from "vitest";

import { SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS } from "@/features/diagnostics";
import { createOpenedMarkdownDocument } from "@/test/factories/document";
import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";
import { mockTauriApi } from "@/test/utils/tauriApi";

import { openMarkdownDocument, saveMarkdownDocument } from "./markdownDocument";

describe("markdown document service", () => {
  it("logs slow successful open timing without markdown content", async () => {
    const openedDocument = createOpenedMarkdownDocument({
      content: "# Sensitive notes",
    });
    const performanceNow = mockSlowOperation();
    mockTauriApi({
      getDiagnosticsRuntime: () => ({ runId: "run-test" }),
      openMarkdownFile: () => openedDocument,
    });

    try {
      await expect(openMarkdownDocument(TEST_MARKDOWN_FILE_PATH)).resolves.toEqual(openedDocument);
    } finally {
      performanceNow.mockRestore();
    }

    await expect
      .poll(() => vi.mocked(writeLogInfo).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"event":"operationTiming"');

    const logMessage = vi.mocked(writeLogInfo).mock.calls.at(-1)?.[0] ?? "{}";

    expect(logMessage).not.toContain("Sensitive notes");
    expect(JSON.parse(logMessage)).toMatchObject({
      durationMs: SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS + 25,
      event: "operationTiming",
      feature: "document",
      operation: "openMarkdownDocument",
      outcome: "succeeded",
      path: TEST_MARKDOWN_FILE_PATH,
      sizeBytes: openedDocument.metadata.sizeBytes,
      thresholdMs: SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
    });
  });

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
    const performanceNow = mockSlowOperation();
    mockTauriApi({
      getDiagnosticsRuntime: () => ({ runId: "run-test" }),
      saveMarkdownFile: () =>
        Promise.reject({
          kind: "writeFailed",
          message: "disk full",
          path: TEST_MARKDOWN_FILE_PATH,
        }),
    });

    try {
      await expect(
        saveMarkdownDocument(TEST_MARKDOWN_FILE_PATH, "# Sensitive draft", {
          overwrite: true,
        }),
      ).rejects.toMatchObject({
        kind: "writeFailed",
      });
    } finally {
      performanceNow.mockRestore();
    }

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

    await expect
      .poll(() => vi.mocked(writeLogInfo).mock.calls.at(-1)?.[0] ?? "")
      .toContain('"event":"operationTiming"');

    const timingLogMessage = vi.mocked(writeLogInfo).mock.calls.at(-1)?.[0] ?? "{}";

    expect(timingLogMessage).not.toContain("Sensitive draft");
    expect(JSON.parse(timingLogMessage)).toMatchObject({
      durationMs: SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS + 25,
      errorKind: "writeFailed",
      event: "operationTiming",
      feature: "document",
      operation: "saveMarkdownDocument",
      outcome: "failed",
      overwrite: true,
      path: TEST_MARKDOWN_FILE_PATH,
      thresholdMs: SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
    });
  });
});

const mockSlowOperation = () =>
  vi
    .spyOn(performance, "now")
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS + 25);
