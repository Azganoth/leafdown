import { $, browser, expect } from "@wdio/globals";
import path from "node:path";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, findTreeItem, openMenu } from "../support/ui.js";

describe("desktop launch document", () => {
  it("opens the document named on the command line through the open workflow", async () => {
    const { launchDocument } = await getDesktopE2ERunContext();

    const editor = $('[contenteditable="true"]');
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
});
