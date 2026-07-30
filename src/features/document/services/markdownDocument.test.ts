import { describe, expect, it, vi } from "vitest";

import { SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS } from "@/features/diagnostics";
import { createOpenedMarkdownDocument } from "@/test/factories/document";
import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";
import { getLastDiagnosticMessage, pollForDiagnosticMessage } from "@/test/utils/diagnostics";
import { mockTauriApi } from "@/test/utils/tauriApi";

import { openMarkdownDocument, saveMarkdownDocument } from "./markdownDocument";

describe("markdown document service", () => {
  it("logs slow successful open timing without markdown content", async () => {
    const openedDocument = createOpenedMarkdownDocument({
      content: "# Sensitive notes",
    });
    const performanceNow = mockSlowOperation();
    mockTauriApi({
      openMarkdownFile: () => openedDocument,
    });

    try {
      await expect(openMarkdownDocument(TEST_MARKDOWN_FILE_PATH)).resolves.toEqual(openedDocument);
    } finally {
      performanceNow.mockRestore();
    }

    await pollForDiagnosticMessage("info", '"event":"operationTiming"');

    const logMessage = getLastDiagnosticMessage("info");

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
      openMarkdownFile: () =>
        Promise.reject({
          kind: "missingFile",
          path: TEST_MARKDOWN_FILE_PATH,
        }),
    });

    await expect(openMarkdownDocument(TEST_MARKDOWN_FILE_PATH)).rejects.toMatchObject({
      kind: "missingFile",
    });

    await pollForDiagnosticMessage("warn", '"operation":"openMarkdownDocument"');

    const payload = JSON.parse(getLastDiagnosticMessage("warn")) as {
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

    await pollForDiagnosticMessage("warn", '"operation":"saveMarkdownDocument"');

    const logMessage = getLastDiagnosticMessage("warn");
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

    await pollForDiagnosticMessage("info", '"event":"operationTiming"');

    const timingLogMessage = getLastDiagnosticMessage("info");

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
