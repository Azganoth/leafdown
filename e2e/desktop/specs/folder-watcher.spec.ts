import { $, $$, browser, expect } from "@wdio/globals";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findTreeItem, openRecentPath } from "../support/ui.js";

const WATCHER_SETTLE_MS = 1_000;

describe("desktop folder context watcher", () => {
  it("refreshes article navigation after an external filesystem change", async () => {
    const { folder } = await getDesktopE2ERunContext();

    await openRecentPath(folder.path);

    const initialArticle = await findTreeItem(folder.initialFileName);
    await expect(initialArticle).toBeDisplayed();
    await expect(initialArticle).toHaveAttribute("aria-selected", "true");
    await expect($('[data-testid=active-document-host] [contenteditable="true"]')).toHaveText(
      expect.stringContaining(folder.initialMarker),
    );

    await waitForDiagnosticRecord(
      (record) =>
        record.event === "operationLifecycle" &&
        record.feature === "folder-context" &&
        record.operation === "folderContextWatcher" &&
        record.phase === "started",
    );

    await writeFile(folder.addedFilePath, `${folder.addedMarker}\n`);

    const addedArticle = await findTreeItem(folder.addedFileName);
    await expect(addedArticle).toBeDisplayed();
    await addedArticle.click();
    await expect(addedArticle).toHaveAttribute("aria-selected", "true");
    await expect($('[data-testid=active-document-host] [contenteditable="true"]')).toHaveText(
      expect.stringContaining(folder.addedMarker),
    );
  });

  it("refreshes article navigation after an external directory rename", async () => {
    const { folder } = await getDesktopE2ERunContext();
    const directoryPath = path.join(folder.path, "watcher-directory");
    const renamedDirectoryPath = path.join(folder.path, "watcher-renamed");

    await mkdir(directoryPath);
    await writeFile(path.join(directoryPath, "nested.md"), "Nested article.\n");
    await expect(await findTreeItem("watcher-directory")).toBeDisplayed();

    await rename(directoryPath, renamedDirectoryPath);

    await expect(await findTreeItem("watcher-renamed")).toBeDisplayed();
    expect(await $$('[role="treeitem"]').map((item) => item.getText())).not.toContain(
      "watcher-directory",
    );
  });

  it("drops a directory whose name contains a dot after it moves out of the folder", async () => {
    const { folder } = await getDesktopE2ERunContext();
    const directoryPath = path.join(folder.path, "watcher.d");
    const movedDirectoryPath = path.join(path.dirname(folder.path), "watcher.d");

    await mkdir(directoryPath);
    await writeFile(path.join(directoryPath, "nested.md"), "Nested article.\n");
    await expect(await findTreeItem("watcher.d")).toBeDisplayed();

    await rename(directoryPath, movedDirectoryPath);

    await browser.waitUntil(
      async () =>
        !(await $$('[role="treeitem"]').map((item) => item.getText())).includes("watcher.d"),
      { timeoutMsg: "Tree item watcher.d stayed after its directory moved out of the folder." },
    );
  });

  it("lists unsupported files that never open and tells their folders from empty ones", async () => {
    const { folder } = await getDesktopE2ERunContext();
    const assetsPath = path.join(folder.path, "watcher-assets");
    const emptyPath = path.join(folder.path, "watcher-empty");
    const unsupportedPath = path.join(folder.path, "watcher-notes.txt");

    await mkdir(emptyPath);
    await mkdir(assetsPath);
    await writeFile(path.join(assetsPath, "cover.png"), "");
    await writeFile(unsupportedPath, "Plain text fixture.\n");

    const unsupportedRow = await findTreeItem("watcher-notes.txt");
    await expect(unsupportedRow).toHaveAttribute(
      "aria-description",
      "Leafdown can only open Markdown files.",
    );
    await expect(await findTreeItem("watcher-assets")).toHaveAttribute("aria-expanded", "false");
    await expect(await findTreeItem("watcher-empty")).not.toHaveAttribute("aria-expanded");

    await unsupportedRow.click();
    await browser.keys("Enter");
    await browser.pause(WATCHER_SETTLE_MS);

    await expect(unsupportedRow).toBeFocused();
    await expect(unsupportedRow).toHaveAttribute("aria-selected", "false");
    await expect($('[data-testid=active-document-host] [contenteditable="true"]')).toHaveText(
      expect.stringContaining(folder.addedMarker),
    );
    expect(await $$('[data-slot="toast"][data-type="error"]').length).toBe(0);

    await rm(unsupportedPath);

    await browser.waitUntil(
      async () =>
        !(await $$('[role="treeitem"]').map((item) => item.getText())).includes(
          "watcher-notes.txt",
        ),
      { timeoutMsg: "Tree item watcher-notes.txt stayed after its file was deleted." },
    );

    await rm(assetsPath, { recursive: true });
    await rm(emptyPath, { recursive: true });
  });
});
