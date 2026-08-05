import { $, $$, browser } from "@wdio/globals";

type MenuItemPredicate = (text: string) => boolean;

export const openMenu = async (label: string) => {
  await $(`aria/${label}`).click();
  await browser.keys("Enter");
};

export const findMenuItem = async (predicate: MenuItemPredicate) => {
  const result: { item?: WebdriverIO.Element } = {};

  await browser.waitUntil(
    async () => {
      const items = await $$(
        '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]',
      );

      for (const item of items) {
        if (predicate((await item.getText()).trim())) {
          result.item = item;
          return true;
        }
      }

      return false;
    },
    { timeoutMsg: "Expected menu item did not appear." },
  );

  if (!result.item) {
    throw new Error("Expected menu item did not appear.");
  }

  return result.item;
};

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

export const findTreeItem = async (label: string) => {
  const result: { item?: WebdriverIO.Element } = {};

  await browser.waitUntil(
    async () => {
      const items = await $$('[role="treeitem"]');

      for (const item of items) {
        if ((await item.getText()).trim() === label) {
          result.item = item;
          return true;
        }
      }

      return false;
    },
    { timeoutMsg: `Tree item ${label} did not appear.` },
  );

  if (!result.item) {
    throw new Error(`Tree item ${label} did not appear.`);
  }

  return result.item;
};
