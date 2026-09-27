import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openRecentPath } from "../support/ui.js";

const windows1252 = (text: string) => Buffer.from(text, "latin1");

const replaceDocumentText = async (text: string) => {
  const editor = $('[contenteditable="true"]');

  await editor.click();
  await browser.keys([Key.Ctrl, "a"]);
  await browser.keys(Key.NULL);
  await editor.addValue(text);
};

const save = () => browser.keys([Key.Ctrl, "s", Key.NULL]);

describe("desktop legacy encoding", () => {
  it("reopens a Windows-1252 file with a chosen encoding and saves it back in that encoding", async () => {
    const { legacyEncoding } = await getDesktopE2ERunContext();
    const originalWindows1252 = windows1252("Café legacy fixture marker.\n");

    await openRecentPath(legacyEncoding.path);

    const errorToast = $('[data-slot="toast"][data-type="error"]');
    await expect(errorToast).toHaveText(expect.stringContaining("Invalid Markdown file encoding."));
    await errorToast.$("button=Reopen with encoding").click();
    await (await findMenuItem((text) => text === "Western (Windows-1252, ISO-8859-1)")).click();

    const editor = $('[contenteditable="true"]');
    await expect(editor).toHaveText(expect.stringContaining("Café"));
    await expect($('[data-testid="status-bar-encoding"]')).toHaveText("Windows-1252");

    await replaceDocumentText("Edited Café ü");
    await save();

    await browser.waitUntil(
      async () => !(await readFile(legacyEncoding.path)).equals(originalWindows1252),
      { timeoutMsg: "The edited file was not saved." },
    );
    expect((await readFile(legacyEncoding.path)).toString("latin1")).toBe("Edited Café ü\n");
    const editedWindows1252 = await readFile(legacyEncoding.path);

    await replaceDocumentText("Edited Café ü ✓");
    await save();

    const unrepresentablePrompt = $('[data-slot="dialog-content"][data-open]');
    await expect(unrepresentablePrompt).toHaveText(
      expect.stringContaining("Characters cannot be saved"),
    );
    await expect(unrepresentablePrompt).toHaveText(expect.stringContaining("✓ (U+2713)"));
    await unrepresentablePrompt.$("button=Cancel").click();
    await expect(unrepresentablePrompt).not.toExist();
    expect((await readFile(legacyEncoding.path)).equals(editedWindows1252)).toBe(true);

    await editor.click();
    await save();
    await $("button=Convert to UTF-8 and save").click();

    await browser.waitUntil(
      async () => (await readFile(legacyEncoding.path, "utf8")) === "Edited Café ü ✓\n",
      { timeoutMsg: "The converted document was not saved as UTF-8." },
    );
    await expect($('[data-testid="status-bar-encoding"]')).toHaveText("UTF-8");
  });
});
