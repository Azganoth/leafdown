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
  selectFileMenuItem,
} from "../support/ui.js";

const ACTIVE_EDITOR = "[data-testid=active-document-host] .ProseMirror";
const OPEN_DIALOG = '[data-slot="dialog-content"][data-open]';

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

// Typing reaches a window reliably only while it is in front, so the steps below type in a window
// just after it opened or was brought forward.
const openNewWindow = async () => {
  const handles = await browser.getWindowHandles();

  await selectFileMenuItem("New window");

  let opened: string | undefined;

  await browser.waitUntil(
    async () => {
      opened = (await browser.getWindowHandles()).find((handle) => !handles.includes(handle));
      return opened !== undefined;
    },
    { timeoutMsg: "File > New window did not open a window." },
  );

  await browser.switchToWindow(opened!);
  await expect($("aria/New document")).toBeDisplayed();

  return opened!;
};

describe("desktop multiple windows", () => {
  it("keeps a file in one window, closes a window on its own, and quits window by window", async () => {
    const diagnostics = await getDiagnosticsSummary();
    const processId = Number(diagnostics.runId.slice(diagnostics.runId.lastIndexOf("-") + 1));
    const { callouts, citations } = await getDesktopE2ERunContext();
    const calloutsName = path.basename(callouts.path);
    const citationsName = path.basename(citations.path);
    const mainWindow = await browser.getWindowHandle();

    for (const filePath of [callouts.path, citations.path]) {
      await openRecentPath(filePath);
      await findDocumentTab(path.basename(filePath));
    }
    await dismissToasts();
    await appendToActiveEditor("Main window edit");

    const secondWindow = await openNewWindow();
    expect(await countDocumentTabs()).toBe(0);
    await $("aria/New document").click();
    await appendToActiveEditor("Second window edit");

    // The file is already open in the first window, which shows it instead.
    await openRecentPath(callouts.path);
    await browser.switchToWindow(mainWindow);
    await expect(await findDocumentTab(calloutsName)).toHaveAttribute("aria-selected", "true");
    expect(await countDocumentTabs()).toBe(2);
    await browser.switchToWindow(secondWindow);
    expect(await countDocumentTabs()).toBe(1);

    // Closing a window asks only about its own unsaved documents and leaves the others running.
    await $("aria/Close window").click();
    const closePrompt = $(OPEN_DIALOG);
    await expect(closePrompt).toBeDisplayed();
    // One document named, not two: the first window's unsaved tab is not part of this close.
    await expect(closePrompt).toHaveText(expect.stringContaining("Untitled has unsaved changes."));
    await $("aria/Discard changes").click();
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 1, {
      timeoutMsg: "The second window did not close.",
    });
    expect(isProcessRunning(processId)).toBe(true);

    // Quit closes the clean window it was chosen in, then asks the first window, where Cancel
    // stops it.
    await browser.switchToWindow(mainWindow);
    await openNewWindow();
    await selectFileMenuItem("Quit");
    await browser.switchToWindow(mainWindow);
    const quitPrompt = $(OPEN_DIALOG);
    await expect(quitPrompt).toBeDisplayed();
    await expect(quitPrompt).toHaveText(
      expect.stringContaining(`${citationsName} has unsaved changes.`),
    );
    expect(await browser.getWindowHandles()).toEqual([mainWindow]);
    await browser.keys(Key.Escape);
    await expect(quitPrompt).not.toExist();
    expect(await countDocumentTabs()).toBe(2);
    expect(isProcessRunning(processId)).toBe(true);

    await selectFileMenuItem("Quit");
    await expect($(OPEN_DIALOG)).toBeDisplayed();
    await $("aria/Discard changes").click();

    await waitForProcessExit(processId);
  });
});
