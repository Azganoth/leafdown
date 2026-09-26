import { $, $$, expect } from "@wdio/globals";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findTreeItem, openRecentPath } from "../support/ui.js";

describe("desktop folder context watcher", () => {
  it("refreshes article navigation after an external filesystem change", async () => {
    const { folder } = await getDesktopE2ERunContext();

    await openRecentPath(folder.path);

    const initialArticle = await findTreeItem(folder.initialFileName);
    await expect(initialArticle).toBeDisplayed();
    await expect(initialArticle).toHaveAttribute("aria-selected", "true");
    await expect($('[contenteditable="true"]')).toHaveText(
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
    await expect($('[contenteditable="true"]')).toHaveText(
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
});
