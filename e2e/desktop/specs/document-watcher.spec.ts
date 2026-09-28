import { $, $$, browser, expect } from "@wdio/globals";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { dismissToasts, getSaveMenuItem, openRecentPath } from "../support/ui.js";

const WATCHER_SETTLE_MS = 1_000;

const editor = () => $('[contenteditable="true"]');

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

const toast = (type: "success" | "warning") => $(`[data-slot="toast"][data-type="${type}"]`);

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

    await waitForEditorText("Rewritten in place.");
    await expect(toast("success")).toHaveText(expect.stringContaining("Reloaded from disk"));
    const cleanSaveItem = await getSaveMenuItem();
    await expect(cleanSaveItem).toHaveAttribute("data-disabled");
    await browser.keys("Escape");
    await dismissToasts();

    await replaceFile(documentWatcher.path, "Replaced by rename.\n");

    await waitForEditorText("Replaced by rename.");
    await expect(toast("success")).toHaveText(expect.stringContaining("Reloaded from disk"));
    await dismissToasts();

    await replaceDocumentText("Unsaved local edit.");
    await writeFile(documentWatcher.path, "External edit.\n");

    await expect(toast("warning")).toHaveText(expect.stringContaining("File changed on disk"));
    await waitForEditorText("Unsaved local edit.");
    await dismissToasts();

    await save();
    const prompt = $('[data-slot="dialog-content"][data-open]');
    await expect(prompt).toHaveText(expect.stringContaining("File changed"));
    await prompt.$("button=Cancel save").click();
    await expect(prompt).not.toExist();
    expect(await readFile(documentWatcher.path, "utf8")).toBe("External edit.\n");

    await save();
    await $("button=Overwrite anyway").click();
    await browser.waitUntil(
      async () => (await readFile(documentWatcher.path, "utf8")) === "Unsaved local edit.\n",
      { timeoutMsg: "The confirmed overwrite did not reach the file." },
    );
    await browser.pause(WATCHER_SETTLE_MS);
    expect(await $$('[data-slot="toast"][data-type="warning"]').length).toBe(0);
    await dismissToasts();

    await rm(documentWatcher.path);

    await expect(toast("warning")).toHaveText(expect.stringContaining("File missing"));
    await waitForEditorText("Unsaved local edit.");
  });
});
