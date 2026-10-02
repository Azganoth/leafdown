import { $, browser, expect } from "@wdio/globals";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu, openRecentPath } from "../support/ui.js";

const query = () => $('input[aria-label="Search commands"]');

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

describe("desktop command palette", () => {
  it("preserves editor state, exposes unavailable commands, and transfers focus to a chosen dialog", async () => {
    const { search } = await getDesktopE2ERunContext();
    await openRecentPath(search.path);
    await expect($(".ProseMirror")).toBeDisplayed();
    await $(".ProseMirror p").click();
    await browser.execute(() => document.querySelector<HTMLElement>(".ProseMirror")?.focus());
    await expect($(".ProseMirror")).toBeFocused();

    const before = await browser.execute(() => ({
      content: document.querySelector(".ProseMirror")?.innerHTML,
      selection: document.getSelection()?.anchorOffset,
    }));

    expect(await pressKey("p", { ctrlKey: true, shiftKey: true })).toBe(true);
    await expect(query()).toBeFocused();
    await query().setValue("add row below");
    const unavailable = $('[role="option"][aria-disabled="true"]');
    await expect(unavailable).toHaveText(expect.stringContaining("Add row below"));
    await expect(unavailable).not.toHaveText(
      expect.stringContaining("The editor command is not available."),
    );
    await expect($('[data-slot="dialog-footer"] [data-slot="button"]')).toBeDisabled();
    await pressKey("Enter");
    await expect(query()).toBeDisplayed();

    await pressKey("Escape");
    await expect(query()).not.toExist();
    await browser.waitUntil(
      () => browser.execute(() => document.activeElement?.matches(".ProseMirror") ?? false),
      {
        timeoutMsg: `Editor focus was not restored after dismissing the palette: ${await browser.execute(() => document.activeElement?.outerHTML.slice(0, 200))}`,
      },
    );
    const after = await browser.execute(() => ({
      content: document.querySelector(".ProseMirror")?.innerHTML,
      selection: document.getSelection()?.anchorOffset,
    }));
    expect(after).toEqual(before);

    await openMenu("View");
    const paletteItem = await findMenuItem((text) => text.startsWith("Command palette"));
    const zoomItem = await findMenuItem((text) => text.startsWith("Zoom in"));
    expect((await paletteItem.getCSSProperty("padding-left")).value).toBe(
      (await zoomItem.getCSSProperty("padding-left")).value,
    );
    await paletteItem.click();
    await expect(query()).toBeFocused();
    await query().setValue("preferences");
    await pressKey("Enter");
    await expect(query()).not.toExist();
    await expect($("aria/Preferences")).toBeDisplayed();
    await browser.keys("Escape");
    await expect($("aria/Preferences")).not.toExist();
  });

  it("keeps the palette usable at a narrow window width", async () => {
    const originalSize = await browser.getWindowSize();
    try {
      await browser.setWindowSize(640, 600);
      await $(".ProseMirror p").click();
      await browser.execute(() => document.querySelector<HTMLElement>(".ProseMirror")?.focus());
      expect(await pressKey("p", { ctrlKey: true, shiftKey: true })).toBe(true);
      await expect(query()).toBeFocused();
      const resultsViewport = $('[data-slot="dialog-content"] [data-slot="scroll-area-viewport"]');
      await expect(resultsViewport).toHaveAttribute("tabindex", "-1");
      await expect($('[data-slot="dialog-footer"] [data-slot="button"]')).toHaveAttribute(
        "tabindex",
        "0",
      );
      const layout = await browser.execute(() => {
        const input = document.querySelector('input[aria-label="Search commands"]');
        const popup = input?.closest('[data-slot="dialog-content"]');
        const results = popup?.querySelector('[data-slot="scroll-area-viewport"]');
        const footer = popup?.querySelector('[data-slot="dialog-footer"]');
        if (!input || !results || !footer) throw new Error("Palette sections were not found.");
        const resultBounds = results.getBoundingClientRect();
        const partialRow = [...results.querySelectorAll('[role="option"]')].some((option) => {
          const row = option.getBoundingClientRect();
          return row.top < resultBounds.bottom && row.bottom > resultBounds.bottom;
        });
        return {
          inputBottom: input.getBoundingClientRect().bottom,
          resultsTop: resultBounds.top,
          resultsBottom: resultBounds.bottom,
          footerTop: footer.getBoundingClientRect().top,
          partialRow,
          maxHeight: getComputedStyle(results).maxHeight,
          listHeight: resultBounds.height,
          rowHeight: results.querySelector('[role="option"]')?.getBoundingClientRect().height,
        };
      });
      expect(layout.inputBottom).toBeLessThan(layout.resultsTop);
      expect(layout.resultsBottom).toBeLessThan(layout.footerTop);
      if (layout.partialRow) throw new Error(`Palette row is clipped: ${JSON.stringify(layout)}`);
      await browser.execute(() => {
        const results = document
          .querySelector('input[aria-label="Search commands"]')
          ?.closest('[data-slot="dialog-content"]')
          ?.querySelector('[data-slot="scroll-area-viewport"]');
        if (results) results.scrollTop = results.scrollHeight;
      });
      const scrollLayout = await browser.execute(() => {
        const results = document
          .querySelector('input[aria-label="Search commands"]')
          ?.closest('[data-slot="dialog-content"]')
          ?.querySelector('[data-slot="scroll-area-viewport"]');
        if (!results) throw new Error("Palette results were not found.");
        const viewport = results.getBoundingClientRect();
        return [...results.querySelectorAll('[role="option"]')].some((option) => {
          const row = option.getBoundingClientRect();
          return (
            (row.top < viewport.top && row.bottom > viewport.top) ||
            (row.top < viewport.bottom && row.bottom > viewport.bottom)
          );
        });
      });
      expect(scrollLayout).toBe(false);
      await expect(query()).toBeDisplayed();
      await expect($('[data-slot="dialog-footer"] [data-slot="button"]')).toBeDisplayed();
      await query().setValue("save");
      await expect($('[role="option"]')).toBeDisplayed();
      await pressKey("End");
      const bounds = await browser.execute(() => {
        const popup = document.querySelector('[data-slot="dialog-content"]');
        if (!popup) throw new Error("Command palette popup was not found.");
        const rect = popup.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: window.innerWidth };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width);
      await pressKey("Escape");
      await expect(query()).not.toExist();
    } finally {
      await browser.setWindowSize(originalSize.width, originalSize.height);
    }
  });

  it("dispatches an editor command through the palette", async () => {
    await browser.execute(() => document.querySelector<HTMLElement>(".ProseMirror")?.focus());
    expect(await pressKey("p", { ctrlKey: true, shiftKey: true })).toBe(true);
    await expect(query()).toBeFocused();
    await query().setValue("select all");
    await pressKey("Enter");
    await expect(query()).not.toExist();

    const selectedText = await browser.execute(() => document.getSelection()?.toString() ?? "");
    expect(selectedText.length).toBeGreaterThan(100);
  });
});
