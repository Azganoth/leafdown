import { $, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { getDiagnosticsSummary } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import {
  dismissToasts,
  findDocumentTab,
  openRecentPath,
  selectFileMenuItem,
} from "../support/ui.js";

const ACTIVE_EDITOR = "[data-testid=active-document-host] .ProseMirror";

const isProcessRunning = (processId: number) => {
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
};

const waitForProcessExit = async (processId: number) => {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (!isProcessRunning(processId)) {
      return;
    }

    await delay(100);
  }

  throw new Error(`The application process ${processId} did not exit after Quit.`);
};

const appendToActiveEditor = async (text: string) => {
  const editor = $(ACTIVE_EDITOR);

  await editor.click();
  await editor.addValue(text);
  await expect(editor).toHaveText(expect.stringContaining(text));
};

describe("desktop kept session before quitting", () => {
  it("quits without asking and leaves the edited file as it was", async () => {
    const diagnostics = await getDiagnosticsSummary();
    const processId = Number(diagnostics.runId.slice(diagnostics.runId.lastIndexOf("-") + 1));
    const { callouts } = await getDesktopE2ERunContext();
    const original = await readFile(callouts.path, "utf8");

    await openRecentPath(callouts.path);
    await findDocumentTab(path.basename(callouts.path));
    await dismissToasts();
    await appendToActiveEditor("Kept edit marker");

    await selectFileMenuItem("New");
    await findDocumentTab("Untitled");
    await appendToActiveEditor("Untitled kept marker");

    await selectFileMenuItem("Quit");

    await waitForProcessExit(processId);
    expect(await readFile(callouts.path, "utf8")).toBe(original);
  });
});
