import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu } from "../support/ui.js";

describe("desktop persistence before restart", () => {
  it("changes the sidebar setting through the assembled menu and persists it", async () => {
    const { settingsPath } = await getDesktopE2ERunContext();

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
});
