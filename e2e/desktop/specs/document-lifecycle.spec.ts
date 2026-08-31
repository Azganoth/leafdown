import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { getSaveMenuItem, openRecentPath, selectFileMenuItem } from "../support/ui.js";

describe("desktop document lifecycle", () => {
  it("opens, edits, saves, and reopens a fixture through real IPC", async () => {
    const { document } = await getDesktopE2ERunContext();

    await openRecentPath(document.path);

    const editor = $('[contenteditable="true"]');
    await expect(editor).toBeDisplayed();
    await expect(editor).toHaveText(expect.stringContaining(document.initialMarker));

    const cleanSaveItem = await getSaveMenuItem();
    await expect(cleanSaveItem).toHaveAttribute("data-disabled");
    await browser.keys("Escape");

    await editor.click();
    await browser.keys([Key.Ctrl, "a"]);
    await browser.keys(Key.NULL);
    await editor.addValue(document.savedMarker);

    const dirtySaveItem = await getSaveMenuItem();
    await expect(dirtySaveItem).not.toHaveAttribute("data-disabled");
    await browser.keys("Escape");

    await editor.click();
    await browser.keys([Key.Ctrl, "s", Key.NULL]);

    await browser.waitUntil(
      async () => (await readFile(document.path, "utf8")) === document.savedMarkdown,
      {
        timeoutMsg: "The saved fixture did not reach the expected on-disk contents.",
      },
    );

    const savedSaveItem = await getSaveMenuItem();
    await expect(savedSaveItem).toHaveAttribute("data-disabled");
    await browser.keys("Escape");

    await selectFileMenuItem("Close document");
    await expect($('[contenteditable="true"]')).not.toExist();

    await openRecentPath(document.path);
    await expect($('[contenteditable="true"]')).toHaveText(
      expect.stringContaining(document.savedMarker),
    );
  });
});
