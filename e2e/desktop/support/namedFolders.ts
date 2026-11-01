import { $, browser, expect } from "@wdio/globals";

import { selectFileMenuItem } from "./ui.js";

export const ACTIVE_EDITOR = "[data-testid=active-document-host] .ProseMirror";
export const NAMED_FOLDERS_DIALOG = '[data-slot="dialog-content"][data-open]';

export const openNamedFolders = async () => {
  await selectFileMenuItem("Bookmarks");
  await expect($(NAMED_FOLDERS_DIALOG)).toBeDisplayed();
};

export const closeNamedFolders = async () => {
  await expect($(NAMED_FOLDERS_DIALOG).$("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  await $(NAMED_FOLDERS_DIALOG).$("aria/Close").click();
  await expect($(NAMED_FOLDERS_DIALOG)).not.toBeDisplayed();
};

export const keepCurrentFolder = async (name: string) => {
  await openNamedFolders();
  await $(NAMED_FOLDERS_DIALOG).$("aria/Bookmark folder").click();
  const row = $(NAMED_FOLDERS_DIALOG).$('button[aria-current="true"]').$("..");
  await row.click({ button: "right" });
  const menu = $('[data-slot="context-menu-content"][data-open]');
  await expect(menu).toBeDisplayed();
  await menu.$('[role="menuitem"]=Edit').click();
  const form = $('[data-slot="dialog-content"][data-open] form');
  await expect(form).toBeDisplayed();
  await form.$("input").setValue(name);
  await form.$("button=Save").click();
  await closeNamedFolders();
};

export const chooseNamedFolder = async (name: string) => {
  await openNamedFolders();
  await $(NAMED_FOLDERS_DIALOG)
    .$("button=" + name)
    .click();
  await expect($(NAMED_FOLDERS_DIALOG)).not.toBeDisplayed();
};

export const appendToNamedDraft = async (text: string) => {
  await browser.execute((selector) => {
    const editor = document.querySelector<HTMLElement>(selector)!;
    const paragraph = [...editor.querySelectorAll<HTMLElement>("p")].find(
      (element) =>
        element.getClientRects().length > 0 && !element.closest('[contenteditable="false"]'),
    );
    if (!paragraph) throw new Error("No visible editable paragraph is available for the draft.");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.collapse(false);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();
  }, ACTIVE_EDITOR);
  await $(ACTIVE_EDITOR).addValue(text);
  await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining(text));
};
