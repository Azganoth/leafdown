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
    const reopenedEditor = $('[contenteditable="true"]');
    await expect(reopenedEditor).toHaveText(expect.stringContaining(document.savedMarker));

    await reopenedEditor.click();
    await browser.keys([Key.Ctrl, Key.End, Key.NULL]);
    await reopenedEditor.addValue(" Unsent edit");
    await expect(reopenedEditor).toHaveText(expect.stringContaining("Unsent edit"));
    const unsavedSaveItem = await getSaveMenuItem();
    await expect(unsavedSaveItem).not.toHaveAttribute("data-disabled");
    await browser.keys("Escape");
    await reopenedEditor.click();
    await browser.keys([Key.Ctrl, "w", Key.NULL]);

    const prompt = $('[data-slot="dialog-content"][data-open]');
    await expect(prompt).toBeDisplayed();
    await expect(prompt).toHaveAttribute("aria-labelledby");
    await expect($("aria/Unsaved changes")).toBeDisplayed();
    await expect($("aria/Keep editing")).toBeDisplayed();
    await expect($("aria/Discard changes")).toBeDisplayed();
    await $("#leafdown-titlebar [data-tauri-drag-region]").click();
    await expect(prompt).toBeDisplayed();
    expect(
      await browser.execute(() =>
        Boolean(globalThis.document.activeElement?.closest('[role="dialog"]')),
      ),
    ).toBe(true);
    await $("aria/Maximize window").click();
    await expect(prompt).toBeDisplayed();
    await browser.waitUntil(
      () =>
        browser.execute(() =>
          Boolean(globalThis.document.activeElement?.closest('[role="dialog"]')),
        ),
      { timeoutMsg: "Focus did not return to the dialog after using a window control." },
    );

    await browser.keys(Key.Tab);
    expect(
      await browser.execute(() =>
        Boolean(globalThis.document.activeElement?.closest('[role="dialog"]')),
      ),
    ).toBe(true);

    await browser.keys("Escape");
    await expect(prompt).not.toExist();
    await expect(reopenedEditor).toBeDisplayed();
    await expect(reopenedEditor).toHaveText(expect.stringContaining("Unsent edit"));
    await browser.waitUntil(
      () =>
        browser.execute(() =>
          Boolean(globalThis.document.activeElement?.closest('[contenteditable="true"]')),
        ),
      { timeoutMsg: "Focus did not return to the editor after dismissing the prompt." },
    );

    await browser.keys([Key.Ctrl, "w", Key.NULL]);
    const secondPrompt = $('[data-slot="dialog-content"][data-open]');
    await expect(secondPrompt).toBeDisplayed();
    await $("aria/Discard changes").click();
    await expect(reopenedEditor).not.toExist();
    expect(await readFile(document.path, "utf8")).toBe(document.savedMarkdown);
  });
});
