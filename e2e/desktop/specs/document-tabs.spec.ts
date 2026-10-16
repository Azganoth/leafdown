import { $, browser, expect } from "@wdio/globals";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Key } from "webdriverio";

import { getDiagnosticsSummary } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import {
  countDocumentTabs,
  dismissToasts,
  findDocumentTab,
  openRecentPath,
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

  throw new Error(`The application process ${processId} did not exit after Close window.`);
};

const appendToActiveEditor = async (text: string) => {
  const editor = $(ACTIVE_EDITOR);

  await editor.click();
  await editor.addValue(text);
  await expect(editor).toHaveText(expect.stringContaining(text));
};

const getTabGeometry = () =>
  browser.execute(() =>
    [...document.querySelectorAll('[data-testid="document-tab"]')].map((tab) => {
      const { width, x } = tab.getBoundingClientRect();
      return { width, x };
    }),
  );

describe("desktop document tabs", () => {
  it("keeps each tab's unsaved edits and closes the window through one unsaved-documents dialog", async () => {
    const diagnostics = await getDiagnosticsSummary();
    const processId = Number(diagnostics.runId.slice(diagnostics.runId.lastIndexOf("-") + 1));
    const { callouts, citations, separator } = await getDesktopE2ERunContext();
    const calloutsName = path.basename(callouts.path);
    const citationsName = path.basename(citations.path);
    const separatorName = path.basename(separator.path);

    // A newer open cancels one still reading its file, so each tab appears before the next open.
    for (const filePath of [callouts.path, citations.path, separator.path]) {
      await openRecentPath(filePath);
      await findDocumentTab(path.basename(filePath));
    }
    expect(await countDocumentTabs()).toBe(3);
    await dismissToasts();

    await expect(await findDocumentTab(separatorName)).toHaveAttribute("aria-selected", "true");
    const tabGeometry = await getTabGeometry();
    await appendToActiveEditor("Separator tab edit");

    await (await findDocumentTab(calloutsName)).click();
    await expect(await findDocumentTab(calloutsName)).toHaveAttribute("aria-selected", "true");
    expect(await getTabGeometry()).toEqual(tabGeometry);
    await expect($(ACTIVE_EDITOR)).not.toHaveText(expect.stringContaining("Separator tab edit"));
    await appendToActiveEditor("Callouts tab edit");

    await (await findDocumentTab(separatorName)).click();
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Separator tab edit"));
    await expect($(ACTIVE_EDITOR)).not.toHaveText(expect.stringContaining("Callouts tab edit"));
    await expect(await findDocumentTab(calloutsName)).toHaveAttribute(
      "aria-label",
      `${calloutsName}, unsaved`,
    );
    await expect(await findDocumentTab(citationsName)).toHaveAttribute("aria-label", citationsName);

    await (await findDocumentTab(calloutsName)).click();
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Callouts tab edit"));

    const closeControl = $("aria/Close window");
    await closeControl.click();
    const prompt = $('[data-slot="dialog-content"][data-open]');
    await expect(prompt).toBeDisplayed();
    await expect(prompt).toHaveText(expect.stringContaining("2 documents have unsaved changes"));
    await expect(prompt).toHaveText(expect.stringContaining(calloutsName));
    await expect(prompt).toHaveText(expect.stringContaining(separatorName));
    await browser.keys(Key.Escape);
    await expect(prompt).not.toExist();
    expect(await countDocumentTabs()).toBe(3);
    expect(isProcessRunning(processId)).toBe(true);

    await closeControl.click();
    await expect($('[data-slot="dialog-content"][data-open]')).toBeDisplayed();
    await $("aria/Discard all").click();

    await waitForProcessExit(processId);
  });
});
