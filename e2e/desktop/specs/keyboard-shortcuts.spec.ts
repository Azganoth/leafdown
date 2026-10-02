import { $, browser, expect } from "@wdio/globals";

import { findMenuItem, openMenu } from "../support/ui.js";

const dialog = () => $("aria/Keyboard shortcuts");

const pressKey = (key: string, init: KeyboardEventInit = {}) =>
  browser.execute(
    (eventKey, eventInit) => {
      const target = document.activeElement ?? document.body;
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: eventKey,
        ...eventInit,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    key,
    init,
  );

describe("desktop keyboard shortcuts reference", () => {
  it("opens from Help and restores focus to its menu trigger", async () => {
    await openMenu("Help");
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            [...document.querySelectorAll('[data-slot="menubar-trigger"]')]
              .find((item) => item.textContent?.trim() === "Help")
              ?.getAttribute("aria-expanded") === "true",
        ),
      { timeoutMsg: "Help menu did not open." },
    );
    await (await findMenuItem((text) => text.startsWith("Keyboard shortcuts"))).click();

    await expect(dialog()).toBeDisplayed();
    expect(await dialog().getText()).toContain(
      "Mod means Ctrl on Windows and Linux, or Command on macOS.",
    );
    await browser.keys("Escape");
    await expect(dialog()).not.toExist();
    await browser.waitUntil(
      () => browser.execute(() => document.activeElement?.textContent?.trim() === "Help"),
      { timeoutMsg: "Focus did not return to the Help menu trigger." },
    );
  });

  it("opens with Mod+/ and restores keyboard focus in a narrow window", async () => {
    const originalWindowSize = await browser.getWindowSize();

    try {
      await browser.setWindowSize(480, 540);
      const focusTarget = await browser.execute(() => {
        const button = [
          ...document.querySelectorAll<HTMLElement>('[data-slot="menubar-trigger"]'),
        ].find((candidate) => candidate.textContent?.trim() === "Edit");
        button?.focus();
        return document.activeElement === button;
      });
      expect(focusTarget).toBe(true);
      expect(await pressKey("/", { ctrlKey: true })).toBe(true);
      await expect(dialog()).toBeDisplayed();

      const layout = await browser.execute(() => {
        const popup = document.querySelector<HTMLElement>(
          '[data-slot="dialog-content"][data-open]',
        );
        const viewport = popup?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
        if (!popup || !viewport) throw new Error("Shortcuts dialog or scroll area is missing.");
        const bounds = popup.getBoundingClientRect();
        return {
          fits:
            bounds.left >= 0 &&
            bounds.right <= innerWidth &&
            bounds.top >= 0 &&
            bounds.bottom <= innerHeight,
          scrolls: viewport.scrollHeight > viewport.clientHeight,
          overflowsHorizontally: popup.scrollWidth > popup.clientWidth,
        };
      });
      expect(layout).toEqual({ fits: true, scrolls: true, overflowsHorizontally: false });

      await browser.waitUntil(
        () =>
          browser.execute(
            () => document.activeElement?.getAttribute("data-slot") === "scroll-area-viewport",
          ),
        { timeoutMsg: "The shortcuts list did not receive focus on open." },
      );
      await browser.keys("ArrowDown");
      await browser.waitUntil(
        () =>
          browser.execute(
            () =>
              (document.querySelector<HTMLElement>(
                '[data-slot="dialog-content"][data-open] [data-slot="scroll-area-viewport"]',
              )?.scrollTop ?? 0) > 0,
          ),
        { timeoutMsg: "ArrowDown did not scroll the shortcuts list." },
      );

      await browser.keys("Escape");
      await expect(dialog()).not.toExist();
      await browser.waitUntil(
        () => browser.execute(() => document.activeElement?.textContent?.trim() === "Edit"),
        { timeoutMsg: "Focus did not return to the keyboard shortcut initiator." },
      );
    } finally {
      await browser.setWindowSize(originalWindowSize.width, originalWindowSize.height);
    }
  });
});
