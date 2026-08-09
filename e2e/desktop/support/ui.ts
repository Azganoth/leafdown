import { $, $$, browser } from "@wdio/globals";

const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

const findByText = async (
  selector: string,
  predicate: (text: string) => boolean,
  timeoutMsg: string,
) => {
  const result: { item?: WebdriverIO.Element } = {};

  await browser.waitUntil(
    async () => {
      for (const item of await $$(selector).getElements()) {
        if (predicate((await item.getText()).trim())) {
          result.item = item;
          return true;
        }
      }

      return false;
    },
    { timeoutMsg },
  );

  return result.item!;
};

export const openMenu = async (label: string) => {
  await $(`aria/${label}`).click();
};

export const findMenuItem = (predicate: (text: string) => boolean) =>
  findByText(MENU_ITEM_SELECTOR, predicate, "Expected menu item did not appear.");

export const findTreeItem = (label: string) =>
  findByText('[role="treeitem"]', (text) => text === label, `Tree item ${label} did not appear.`);

export const openRecentPath = async (path: string) => {
  await openMenu("File");
  const openRecent = await findMenuItem((text) => text === "Open recent");
  await openRecent.click();
  await (await findMenuItem((text) => text === path)).click();
};

export const getSaveMenuItem = async () => {
  await openMenu("File");
  return findMenuItem((text) => text.startsWith("Save") && !text.startsWith("Save as"));
};

export const selectFileMenuItem = async (label: string) => {
  await openMenu("File");
  await (await findMenuItem((text) => text.startsWith(label))).click();
};
