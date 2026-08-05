import { $, expect } from "@wdio/globals";
import { writeFile } from "node:fs/promises";

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
      "watcher-started.json",
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
});
