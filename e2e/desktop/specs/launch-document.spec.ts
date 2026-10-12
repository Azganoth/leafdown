import { $, browser, expect } from "@wdio/globals";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { APP_BINARY_PATH } from "../support/suite.js";
import {
  countDocumentTabs,
  findDocumentTab,
  findMenuItem,
  findTreeItem,
  openMenu,
} from "../support/ui.js";

const ACTIVE_EDITOR = '[data-testid=active-document-host] [contenteditable="true"]';

/**
 * Launches Leafdown again as the operating system would, and waits for that launch to hand its
 * arguments to the running instance and exit.
 */
const launchAgain = async (args: string[], cwd: string) => {
  const launch = spawn(APP_BINARY_PATH, args, { cwd, env: process.env, stdio: "ignore" });
  const [code] = (await Promise.race([
    once(launch, "exit"),
    new Promise((_, reject) => {
      setTimeout(() => {
        launch.kill();
        reject(new Error("The second launch did not exit."));
      }, 15_000).unref();
    }),
  ])) as [number | null];

  expect(code).toBe(0);
};

describe("desktop launch document", () => {
  it("opens the document named on the command line through the open workflow", async () => {
    const { launchDocument } = await getDesktopE2ERunContext();

    const editor = $(ACTIVE_EDITOR);
    await expect(editor).toHaveText(expect.stringContaining(launchDocument.marker));

    await expect(await findTreeItem(path.basename(launchDocument.path))).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(await findTreeItem(launchDocument.siblingFileName)).toBeDisplayed();

    await openMenu("File");
    await (await findMenuItem((text) => text === "Open recent")).click();
    await expect(await findMenuItem((text) => text === launchDocument.path)).toBeDisplayed();
    await expect(await findMenuItem((text) => text === launchDocument.folderPath)).toBeDisplayed();
    await browser.keys("Escape");
  });

  it("routes a later launch into the running window instead of starting another instance", async () => {
    const { launchDocument } = await getDesktopE2ERunContext();
    const launchName = path.basename(launchDocument.path);
    const mainWindow = await browser.getWindowHandle();

    await launchAgain([launchDocument.siblingFileName], launchDocument.folderPath);

    await expect(await findDocumentTab(launchDocument.siblingFileName)).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Sibling fixture marker."));
    expect(await countDocumentTabs()).toBe(2);

    await launchAgain([launchDocument.path], launchDocument.folderPath);

    await expect(await findDocumentTab(launchName)).toHaveAttribute("aria-selected", "true");
    expect(await countDocumentTabs()).toBe(2);

    await launchAgain([], launchDocument.folderPath);

    let opened: string | undefined;

    await browser.waitUntil(
      async () => {
        opened = (await browser.getWindowHandles()).find((handle) => handle !== mainWindow);
        return opened !== undefined;
      },
      { timeoutMsg: "A launch without a document did not open a window." },
    );

    await browser.switchToWindow(opened!);
    await expect($("aria/New document")).toBeDisplayed();
    expect(await countDocumentTabs()).toBe(0);
    await browser.switchToWindow(mainWindow);
  });
});
