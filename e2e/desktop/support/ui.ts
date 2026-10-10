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

export const dismissToasts = async () => {
  for (const close of await $$('[data-slot="toast-close"]').getElements()) {
    await close.click();
  }

  await browser.waitUntil(async () => (await $$('[data-slot="toast"]').length) === 0, {
    timeoutMsg: "Toasts were not dismissed.",
  });
};

export const getSaveMenuItem = async () => {
  await openMenu("File");
  return findMenuItem((text) => text.startsWith("Save") && !text.startsWith("Save as"));
};

export const selectFileMenuItem = async (label: string) => {
  await openMenu("File");
  await (await findMenuItem((text) => text.startsWith(label))).click();
};

interface ModifierClickWindow extends Window {
  leafdownModifierClickTarget?: Element;
}

// The embedded driver omits modifiers from pointer actions, and its synthetic mousedown has no
// default action. Dispatch the rendered hit target's mouse sequence with Ctrl, and move the caret
// where a real press would unless mousedown is cancelled. The editor reads that selection before
// mouseup, and, as in Chromium, no click follows once the pressed element has left the document.
export const ctrlClickAt = async (point: { x: number; y: number }) => {
  await browser.execute(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    if (!target) throw new Error("Modifier-click target was not found.");
    const pressed = target.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        ctrlKey: true,
        clientX: x,
        clientY: y,
      }),
    );
    if (pressed) {
      const caret = document.caretPositionFromPoint(x, y);
      target.closest<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
      if (caret) window.getSelection()?.collapse(caret.offsetNode, caret.offset);
    }
    (window as ModifierClickWindow).leafdownModifierClickTarget = target;
  }, point);
  await browser.pause(100);
  await browser.execute(({ x, y }) => {
    const pressed = (window as ModifierClickWindow).leafdownModifierClickTarget;
    const released = document.elementFromPoint(x, y) ?? document.body;
    const init = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 0,
      ctrlKey: true,
      clientX: x,
      clientY: y,
    };
    released.dispatchEvent(new MouseEvent("mouseup", init));
    if (!pressed?.isConnected) return;
    let common: Element | null = pressed;
    while (common && !common.contains(released)) common = common.parentElement;
    common?.dispatchEvent(new MouseEvent("click", init));
  }, point);
};

export const ctrlClickElement = async (element: WebdriverIO.Element) => {
  await element.scrollIntoView();
  const point = await element.execute((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  });

  await ctrlClickAt(point);
};
