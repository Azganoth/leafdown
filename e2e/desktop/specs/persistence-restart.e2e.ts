import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu } from "../support/ui.js";

describe("desktop persistence after restart", () => {
  it("restores the sidebar setting in a fresh packaged-app process", async () => {
    const { settingsPath } = await getDesktopE2ERunContext();

    await openMenu("View");
    const sidebarItem = await findMenuItem((text) => text.startsWith("Toggle sidebar"));
    await expect(sidebarItem).toHaveAttribute("aria-checked", "false");
    await browser.keys("Escape");
    await expect($("aria/Article navigator")).not.toExist();

    const persistedSettings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(persistedSettings.sidebarVisible).toBe(false);
  });
});
