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
  dispatchContextMenu,
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
    await $('[data-testid="article-navigator-host"] [data-slot="popover-trigger"]').click();
    const picker = $('[data-slot="popover-content"]');
    await expect(picker.$("input")).toBeFocused();
    await picker.$("input").setValue("Personal");
    const current = picker.$('button[aria-current="true"]');
    const row = current.$("..");
    await row.moveTo();
    await expect(row.$('button[aria-label="Remove bookmark"]')).toBeEnabled();
    await browser.keys("ArrowDown");
    await expect(current).toBeFocused();
    await current.click();
    await expect(picker).not.toBeDisplayed();

    await openNamedFolders();
    await $(NAMED_FOLDERS_DIALOG).$("button=Add bookmark…").click();
    const addForm = $('[data-slot="dialog-content"][data-open] form');
    await addForm.$("aria/Name").setValue("Invalid folder");
    await addForm.$("aria/Folder").setValue(callouts.path);
    await addForm.$("button=Add bookmark").click();
    await expect(addForm.$('[role="alert"]')).toBeDisplayed();
    expect(await countDocumentTabs()).toBe(2);
    await addForm.$("button=Cancel").click();
    await $(NAMED_FOLDERS_DIALOG).$('button[aria-label="Remove bookmark"]').click();
    await expect($(NAMED_FOLDERS_DIALOG).$('button[aria-current="true"]')).toBeDisplayed();
    await expect($(NAMED_FOLDERS_DIALOG).$('button[aria-label="Bookmark folder"]')).toBeEnabled();
    expect(await countDocumentTabs()).toBe(2);
    await closeNamedFolders();
    await keepCurrentFolder("Personal notes");

    await selectFileMenuItem("Close folder");
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
    await dispatchContextMenu(
      await $(NAMED_FOLDERS_DIALOG).$("button=Personal notes").getElement(),
    );
    const menu = $('[data-slot="context-menu-content"][data-open]');
    await expect(menu).toBeDisplayed();
    await menu.$('[role="menuitem"]=Open in new window').click();
    await browser.waitUntil(
      async () => (await browser.getWindowHandles()).length === before.length + 1,
    );
    const secondWindow = (await browser.getWindowHandles()).find(
      (handle) => !before.includes(handle),
    )!;
    await browser.switchToWindow(firstWindow);
    await closeNamedFolders();
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
