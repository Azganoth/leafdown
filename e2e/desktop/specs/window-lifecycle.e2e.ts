import { $, $$, browser, expect } from "@wdio/globals";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ARTIFACTS_DIR } from "../support/artifacts.js";
import { type DiagnosticRecord, getDiagnosticsSummary } from "../support/diagnostics.js";

const WINDOW_CONTROL_LABELS = ["Minimize window", "Maximize window", "Close window"];

const waitForNodeCondition = async (
  predicate: () => boolean | Promise<boolean>,
  timeoutMessage: string,
) => {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  throw new Error(timeoutMessage);
};

const isProcessRunning = (processId: number) => {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
};

const readClosingDiagnostic = async (logFilePath: string, runId: string) => {
  const contents = await readFile(logFilePath, "utf8");

  for (const line of contents.split(/\r?\n/u)) {
    try {
      const record = JSON.parse(line) as DiagnosticRecord;

      if (
        record.runId === runId &&
        record.event === "operationLifecycle" &&
        record.feature === "app" &&
        record.operation === "window" &&
        record.phase === "closing"
      ) {
        return record;
      }
    } catch {
      // The app log can contain an incomplete final line while it is being flushed.
    }
  }

  return undefined;
};

describe("desktop window lifecycle", () => {
  it("exposes injected frame controls and exits through the real close handshake", async () => {
    const diagnostics = await getDiagnosticsSummary();
    const processId = Number(diagnostics.runId.slice(diagnostics.runId.lastIndexOf("-") + 1));

    expect(processId).toBeGreaterThan(0);

    await browser.waitUntil(
      async () => (await $$("[data-tauri-frame-tb] > button").getElements()).length === 3,
      { timeoutMsg: "The native frame controls were not injected." },
    );

    const controls = await $$("[data-tauri-frame-tb] > button").getElements();
    expect(await controls.map((control) => control.getAttribute("aria-label"))).toEqual(
      WINDOW_CONTROL_LABELS,
    );

    for (const control of controls) {
      await expect(control).toHaveAttribute("tabindex", "-1");
    }

    const closeControl = $("aria/Close window");
    await closeControl.click();

    await waitForNodeCondition(
      () => !isProcessRunning(processId),
      `The packaged application process ${processId} did not exit after Close window.`,
    );

    let closingDiagnostic: DiagnosticRecord | undefined;
    await waitForNodeCondition(async () => {
      closingDiagnostic = await readClosingDiagnostic(diagnostics.logFilePath, diagnostics.runId);
      return Boolean(closingDiagnostic);
    }, "The clean window-closing diagnostic was not flushed before process exit.");

    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await writeFile(
      path.join(ARTIFACTS_DIR, "window-close-evidence.json"),
      `${JSON.stringify(
        {
          closingDiagnostic,
          controls: WINDOW_CONTROL_LABELS,
          processExited: true,
          processId,
        },
        null,
        2,
      )}\n`,
    );
  });
});
