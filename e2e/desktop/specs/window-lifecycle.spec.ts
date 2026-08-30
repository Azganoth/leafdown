import { $, $$, browser, expect } from "@wdio/globals";
import { setTimeout as delay } from "node:timers/promises";

import { getDiagnosticsSummary, readRunDiagnostics } from "../support/diagnostics.js";

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

    await delay(100);
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

    await waitForNodeCondition(
      async () =>
        (await readRunDiagnostics(diagnostics)).some(
          (record) =>
            record.event === "operationLifecycle" &&
            record.feature === "app" &&
            record.operation === "window" &&
            record.phase === "closing",
        ),
      "The clean window-closing diagnostic was not flushed before process exit.",
    );
  });
});
