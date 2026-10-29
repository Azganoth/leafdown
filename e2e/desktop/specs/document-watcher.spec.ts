import { $, $$, browser, expect } from "@wdio/globals";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { dismissToasts, getSaveMenuItem, openRecentPath } from "../support/ui.js";

const WATCHER_SETTLE_MS = 1_000;

const editor = () => $('[data-testid=active-document-host] [contenteditable="true"]');

// A reload remounts the editor, and an element matched before it stays detached, so each poll
// queries the editor again.
const waitForEditorText = (text: string) =>
  browser.waitUntil(
    async () => {
      try {
        return (await editor().getText()).includes(text);
      } catch {
        return false;
      }
    },
    { timeoutMsg: `The editor did not show "${text}".` },
  );

const documentState = () => $('[data-testid="status-bar-document-state"]');

const toast = () => $('[data-slot="toast"][data-type="warning"]');
const prompt = () => $('[data-slot="dialog-content"][data-open]');

const replaceDocumentText = async (text: string) => {
  await editor().click();
  await browser.keys([Key.Ctrl, "a"]);
  await browser.keys(Key.NULL);
  await editor().addValue(text);
};

const save = async () => {
  await editor().click();
  await browser.keys([Key.Ctrl, "s", Key.NULL]);
};

// Many editors save by writing a new file and renaming it over the old one.
const replaceFile = async (filePath: string, content: string) => {
  const stagingPath = `${filePath}.external-save`;

  await writeFile(stagingPath, content);
  await rename(stagingPath, filePath);
};

describe("desktop active document watcher", () => {
  it("follows changes another program makes to the open file", async () => {
    const { documentWatcher } = await getDesktopE2ERunContext();

    await openRecentPath(documentWatcher.path);
    await waitForEditorText("Watched fixture marker.");
    await waitForDiagnosticRecord(
      (record) =>
        record.event === "operationLifecycle" &&
        record.feature === "document" &&
        record.operation === "documentWatcher" &&
        record.phase === "started",
    );
    await dismissToasts();

    await writeFile(documentWatcher.path, "Rewritten in place.\n");

    await expect(prompt()).toHaveText(expect.stringContaining("File changed on disk"));
    await waitForEditorText("Watched fixture marker.");
    await prompt().$("button=Reload from disk").click();
    await waitForEditorText("Rewritten in place.");
    const cleanSaveItem = await getSaveMenuItem();
    await expect(cleanSaveItem).toHaveAttribute("data-disabled");
    await browser.keys("Escape");
    await dismissToasts();

    await browser.keys([Key.Ctrl, "n", Key.NULL]);
    await replaceFile(documentWatcher.path, "Replaced by rename.\n");

    await expect(toast()).toHaveText(expect.stringContaining("File changed outside Leafdown"));
    await expect(prompt()).not.toExist();
    await browser.keys([Key.Ctrl, "w", Key.NULL]);
    await expect(prompt()).toHaveText(expect.stringContaining("File changed on disk"));
    await waitForEditorText("Rewritten in place.");
    await prompt().$("button=Reload from disk").click();

    await waitForEditorText("Replaced by rename.");
    await dismissToasts();

    await expect(documentState()).not.toExist();

    await replaceDocumentText("Unsaved local edit.");

    await expect(documentState()).toHaveText("Unsaved");

    await writeFile(documentWatcher.path, "External edit.\n");

    await expect(prompt()).toHaveText(expect.stringContaining("discard your unsaved changes"));
    expect(
      await browser.execute(() => {
        const dialog = document.querySelector('[data-slot="dialog-content"][data-open]');
        return dialog?.contains(document.activeElement);
      }),
    ).toBe(true);
    await prompt().$("button=Keep editing").click();
    await expect(toast()).toHaveText(expect.stringContaining("File changed outside Leafdown"));
    await expect(documentState()).toHaveText("Unsaved, changed on disk");
    await waitForEditorText("Unsaved local edit.");
    await toast().$("button=Actions").click();
    await $('[role="menuitem"]*=Reload ').click();
    const reloadPrompt = $('[data-slot="dialog-content"][data-open]');
    await expect(reloadPrompt).toBeDisplayed();
    await reloadPrompt.$("button=Keep editing").click();
    expect(
      await browser.execute(() => {
        const viewports = document.querySelectorAll('[data-slot="toast-viewport"]');
        const notice = document.querySelector('[data-slot="toast"][data-type="warning"]');
        if (viewports.length !== 1 || !notice) return false;
        const bounds = notice.getBoundingClientRect();
        return (
          bounds.top >= 0 &&
          bounds.bottom <= window.innerHeight &&
          bounds.right <= window.innerWidth
        );
      }),
    ).toBe(true);
    await expect(toast()).toBeDisplayed();
    await waitForEditorText("Unsaved local edit.");
    await dismissToasts();

    await save();
    await expect(prompt()).toHaveText(expect.stringContaining("File changed"));
    await prompt().$("button=Cancel save").click();
    await expect(prompt()).not.toExist();
    expect(await readFile(documentWatcher.path, "utf8")).toBe("External edit.\n");

    await save();
    await $("button=Overwrite anyway").click();
    await browser.waitUntil(
      async () => (await readFile(documentWatcher.path, "utf8")) === "Unsaved local edit.\n",
      { timeoutMsg: "The confirmed overwrite did not reach the file." },
    );
    await browser.pause(WATCHER_SETTLE_MS);
    expect(await $$('[data-slot="toast"][data-type="warning"]').length).toBe(0);
    await expect(documentState()).not.toExist();
    await dismissToasts();

    await rm(documentWatcher.path);

    await expect(prompt()).toHaveText(expect.stringContaining("File missing"));
    await prompt().$("button=Keep editing").click();
    await expect(toast()).toHaveText(expect.stringContaining("File no longer found"));
    await expect(documentState()).toHaveText("File missing");
    await waitForEditorText("Unsaved local edit.");
  });
});
