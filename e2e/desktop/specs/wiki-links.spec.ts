import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";
import { Key } from "webdriverio";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findTreeItem, openRecentPath } from "../support/ui.js";

const link = (source: string) => $(`[data-type="wiki-link"][data-source="${source}"]`);

const activate = (element: WebdriverIO.Element) =>
  element.execute((target) => {
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, button: 0, cancelable: true, ctrlKey: true }),
    );
  });

const caretIsInHeading = () =>
  browser.execute(() =>
    Boolean(globalThis.document.getSelection()?.anchorNode?.parentElement?.closest("h1")),
  );

describe("desktop wiki links", () => {
  it("completes, resolves, and navigates links through real filesystem IPC", async () => {
    const { wikiLinks } = await getDesktopE2ERunContext();
    await openRecentPath(wikiLinks.folderPath);
    await (await findTreeItem("index.md")).click();

    const editor = $('[contenteditable="true"]');
    await expect(editor).toBeDisplayed();
    await expect(link("[[target|Target alias]]")).toHaveAttribute("data-wiki-status", "resolved");
    await expect(link("[[missing|Missing]]")).toHaveAttribute("data-wiki-status", "unresolved");

    await activate(await link("[[missing|Missing]]").getElement());
    await expect($("aria/Link target not found.")).toBeDisplayed();

    await activate(await link("[[#Local heading|Jump local]]").getElement());
    await browser.waitUntil(caretIsInHeading, {
      timeoutMsg: "The same-document wiki link did not select its heading.",
    });

    await editor.addValue(" [[ta");
    const suggestion = $(".leafdown-wiki-completion__option");
    await expect(suggestion).toHaveText("target.md");
    await suggestion.click();
    await browser.keys([Key.Ctrl, "s", Key.NULL]);
    await browser.waitUntil(
      async () => (await readFile(wikiLinks.indexPath, "utf8")).includes("[[target.md]]"),
      {
        timeoutMsg: "The completed wiki link was not saved with its source.",
      },
    );

    await activate(await link("[[target#Target heading|Target section]]").getElement());
    await expect($('[contenteditable="true"]')).toHaveText(
      expect.stringContaining("Target heading"),
    );
    await browser.waitUntil(caretIsInHeading, {
      timeoutMsg: "The cross-document wiki link did not select its heading.",
    });

    await (await findTreeItem("index.md")).click();
    await activate(await link("[[../outside.md|Outside]]").getElement());
    await expect($("aria/Open outside folder?")).toBeDisplayed();
    await $("aria/Open file").click();
    await expect($('[contenteditable="true"]')).toHaveText(
      expect.stringContaining("Outside heading"),
    );
    await expect(await findTreeItem("index.md")).toBeDisplayed();
  });
});
