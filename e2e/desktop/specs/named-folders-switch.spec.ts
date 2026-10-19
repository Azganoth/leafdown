import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { getDiagnosticsSummary } from "../support/diagnostics.js";
import {
  ACTIVE_EDITOR,
  NAMED_FOLDERS_DIALOG,
  appendToNamedDraft,
  chooseNamedFolder,
  closeNamedFolders,
  keepCurrentFolder,
  openNamedFolders,
} from "../support/namedFolders.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import {
  countDocumentTabs,
  dismissToasts,
  findDocumentTab,
  openRecentPath,
  selectFileMenuItem,
} from "../support/ui.js";

describe("desktop named folder switching", () => {
  it("parks distinct tabs and drafts, activates an owner in another window, and parks a closed window", async () => {
    const { callouts, citations } = await getDesktopE2ERunContext();
    const onDisk = await readFile(callouts.path, "utf8");
    const diagnostics = await getDiagnosticsSummary();
    const processId = Number(diagnostics.runId.slice(diagnostics.runId.lastIndexOf("-") + 1));
    const firstWindow = await browser.getWindowHandle();
    await openRecentPath(callouts.path);
    await dismissToasts();
    await appendToNamedDraft("Personal saved draft marker");
    await selectFileMenuItem("New");
    await appendToNamedDraft("Personal untitled draft marker");
    await keepCurrentFolder("Personal notes");
    await openNamedFolders();
    await $(NAMED_FOLDERS_DIALOG).$("button=Park this folder").click();
    await closeNamedFolders();
    expect(await countDocumentTabs()).toBe(0);

    await openRecentPath(citations.path);
    await dismissToasts();
    await appendToNamedDraft("Studies draft marker");
    await keepCurrentFolder("Studies");
    await chooseNamedFolder("Personal notes");
    await expect($(ACTIVE_EDITOR)).toHaveText(
      expect.stringContaining("Personal untitled draft marker"),
    );
    expect(await countDocumentTabs()).toBe(2);
    await (await findDocumentTab(path.basename(callouts.path))).click();
    await expect($(ACTIVE_EDITOR)).toHaveText(
      expect.stringContaining("Personal saved draft marker"),
    );
    await chooseNamedFolder("Studies");
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Studies draft marker"));
    expect(await countDocumentTabs()).toBe(1);

    const before = await browser.getWindowHandles();
    await openNamedFolders();
    const personal = $(NAMED_FOLDERS_DIALOG).$('section[aria-label="Personal notes"]');
    await personal.$("button=Open in new window").click();
    await browser.waitUntil(
      async () => (await browser.getWindowHandles()).length === before.length + 1,
    );
    const secondWindow = (await browser.getWindowHandles()).find(
      (handle) => !before.includes(handle),
    )!;
    await closeNamedFolders();
    await browser.switchToWindow(firstWindow);
    await openRecentPath(callouts.path);
    await browser.switchToWindow(secondWindow);
    await expect($(ACTIVE_EDITOR)).toHaveText(
      expect.stringContaining("Personal saved draft marker"),
    );
    expect(await countDocumentTabs()).toBe(2);
    await selectFileMenuItem("Close window");
    await browser.switchToWindow(firstWindow);
    await browser.waitUntil(async () => (await browser.getWindowHandles()).length === 1);
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Studies draft marker"));
    expect(await readFile(callouts.path, "utf8")).toBe(onDisk);
    await selectFileMenuItem("Quit");
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        process.kill(processId, 0);
      } catch {
        return;
      }
      await delay(100);
    }
    throw new Error("Named folder windows did not finish quitting.");
  });
});
