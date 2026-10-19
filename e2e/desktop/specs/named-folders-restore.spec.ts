import { $, browser, expect } from "@wdio/globals";
import path from "node:path";

import { ACTIVE_EDITOR, chooseNamedFolder } from "../support/namedFolders.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { countDocumentTabs, findDocumentTab } from "../support/ui.js";

describe("desktop named folders after restart", () => {
  it("reopens the window left at quit and restores a parked folder only when selected", async () => {
    const { callouts } = await getDesktopE2ERunContext();
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Studies draft marker"));
    expect(await browser.getWindowHandles()).toHaveLength(1);
    expect(await countDocumentTabs()).toBe(1);
    await chooseNamedFolder("Personal notes");
    expect(await countDocumentTabs()).toBe(2);
    await (await findDocumentTab("Untitled")).click();
    await expect($(ACTIVE_EDITOR)).toHaveText(
      expect.stringContaining("Personal untitled draft marker"),
    );
    await (await findDocumentTab(path.basename(callouts.path))).click();
    await expect($(ACTIVE_EDITOR)).toHaveText(
      expect.stringContaining("Personal saved draft marker"),
    );
  });
});
