import { $, expect } from "@wdio/globals";

import { selectFileMenuItem } from "./ui.js";

export const ACTIVE_EDITOR = "[data-testid=active-document-host] .ProseMirror";
export const NAMED_FOLDERS_DIALOG = '[data-slot="dialog-content"][data-open]';

export const openNamedFolders = async () => {
  await selectFileMenuItem("Named folders");
  await expect($(NAMED_FOLDERS_DIALOG)).toBeDisplayed();
};

export const closeNamedFolders = async () => {
  await expect($(NAMED_FOLDERS_DIALOG).$("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  await $(NAMED_FOLDERS_DIALOG).$("aria/Close").click();
  await expect($(NAMED_FOLDERS_DIALOG)).not.toBeDisplayed();
};

export const keepCurrentFolder = async (name: string) => {
  await openNamedFolders();
  await $(NAMED_FOLDERS_DIALOG).$("input").setValue(name);
  await $(NAMED_FOLDERS_DIALOG).$("button=Keep this folder").click();
  await expect($(NAMED_FOLDERS_DIALOG).$("button=Park this folder")).toBeDisplayed();
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
  await $(ACTIVE_EDITOR).click();
  await $(ACTIVE_EDITOR).addValue(text);
  await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining(text));
};
