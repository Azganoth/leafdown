import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu, openRecentPath } from "../support/ui.js";

describe("desktop persistence before restart", () => {
  it("changes the sidebar setting through the assembled menu and persists it", async () => {
    const { folder, settingsPath } = await getDesktopE2ERunContext();

    await openRecentPath(folder.path);
    await expect($("aria/Article navigator")).toExist();

    await openMenu("View");
    const sidebarItem = await findMenuItem((text) => text.startsWith("Toggle sidebar"));
    await expect(sidebarItem).toHaveAttribute("aria-checked", "true");
    await sidebarItem.click();

    await expect($("aria/Article navigator")).not.toExist();

    await browser.waitUntil(
      async () => {
        try {
          const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<
            string,
            unknown
          >;
          return persisted.sidebarVisible === false;
        } catch {
          return false;
        }
      },
      { timeoutMsg: "The sidebar setting was not persisted before restart." },
    );
  });

  it("hides the status bar through the assembled menu and persists it", async () => {
    const { settingsPath } = await getDesktopE2ERunContext();

    await expect($("aria/Status bar")).toExist();

    await openMenu("View");
    const statusBarItem = await findMenuItem((text) => text.startsWith("Toggle status bar"));
    await expect(statusBarItem).toHaveAttribute("aria-checked", "true");
    await statusBarItem.click();

    await expect($("aria/Status bar")).not.toExist();

    await browser.waitUntil(
      async () => {
        try {
          const persisted = JSON.parse(await readFile(settingsPath, "utf8")) as Record<
            string,
            unknown
          >;
          return persisted.statusBarVisible === false;
        } catch {
          return false;
        }
      },
      { timeoutMsg: "The status bar setting was not persisted before restart." },
    );
  });
});
