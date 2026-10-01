import { $, browser, expect } from "@wdio/globals";
import { Key } from "webdriverio";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { getSaveMenuItem, openMenu, openRecentPath } from "../support/ui.js";

describe("desktop Help pages", () => {
  it("reads bundled pages in a narrow window and restores focus", async () => {
    const { document: fixtureDocument } = await getDesktopE2ERunContext();
    await openRecentPath(fixtureDocument.path);
    const editor = $('[contenteditable="true"]');
    await editor.click();
    await browser.keys([Key.Ctrl, Key.End, Key.NULL]);
    await editor.addValue(" Help draft");
    const selectionBeforeHelp = await browser.execute(() => ({
      offset: document.getSelection()?.anchorOffset,
      text: document.getSelection()?.anchorNode?.textContent,
    }));
    await expect(await getSaveMenuItem()).not.toHaveAttribute("data-disabled");
    await browser.keys("Escape");

    await browser.setWindowSize(640, 480);
    await openMenu("Help");
    await $("aria/Getting started").click();

    await expect($("[role='dialog']")).toBeDisplayed();
    await expect($("[data-slot='dialog-title']")).toHaveText("Getting started");
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const viewport = document
            .querySelector("[role='dialog'] article")
            ?.closest('[role="dialog"]')
            ?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
          return Boolean(
            viewport && viewport.clientHeight > 0 && viewport.scrollHeight > viewport.clientHeight,
          );
        }),
      { timeoutMsg: "Help content did not become scrollable." },
    );
    const layout = await browser.execute(() => {
      const dialog = document
        .querySelector("[role='dialog'] article")
        ?.closest<HTMLElement>('[role="dialog"]');
      const viewport = dialog?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      return {
        dialogBottom: dialog?.getBoundingClientRect().bottom ?? 0,
        viewportHeight: viewport?.clientHeight ?? 0,
        contentHeight: viewport?.scrollHeight ?? 0,
        windowHeight: window.innerHeight,
      };
    });
    expect(layout.dialogBottom).toBeLessThanOrEqual(layout.windowHeight);
    expect(layout.viewportHeight).toBeGreaterThan(0);
    expect(layout.contentHeight).toBeGreaterThan(layout.viewportHeight);
    const scrolling = await browser.execute(() => {
      const viewport = document
        .querySelector("[role='dialog'] article")
        ?.closest('[role="dialog"]')
        ?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (!viewport) {
        return null;
      }
      const before = viewport.scrollTop;
      viewport.scrollTop = viewport.scrollHeight;
      return {
        before,
        after: viewport.scrollTop,
        clientHeight: viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
        overflowY: getComputedStyle(viewport).overflowY,
        parentOverflowY: getComputedStyle(viewport.parentElement!).overflowY,
      };
    });
    if (!scrolling || scrolling.after <= 0) {
      throw new Error(`Help did not scroll: ${JSON.stringify(scrolling)}`);
    }

    await $("article button").click();
    await expect($("[data-slot='dialog-title']")).toHaveText("Markdown reference");
    await expect($("article pre")).toBeDisplayed();
    expect(await browser.getUrl()).not.toContain("github.com");

    await $("article button").click();
    await waitForDiagnosticRecord(
      (record) =>
        record.event === "desktopE2eOpenerSuppressed" &&
        record.command === "openUrl" &&
        record.request === "https://github.com/Azganoth/leafdown/blob/main/docs/specification.md",
    );
    expect(await browser.getUrl()).not.toContain("github.com");

    await browser.keys("Escape");
    await expect($("article")).not.toExist();
    expect(await browser.execute(() => document.activeElement?.textContent?.trim())).toBe("Help");
    await expect(editor).toHaveText(expect.stringContaining("Help draft"));
    await expect(await getSaveMenuItem()).not.toHaveAttribute("data-disabled");
    await browser.keys("Escape");
    const selectionAfterHelp = await browser.execute(() => {
      document.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
      return {
        offset: document.getSelection()?.anchorOffset,
        text: document.getSelection()?.anchorNode?.textContent,
      };
    });
    expect(selectionAfterHelp).toEqual(selectionBeforeHelp);
    await browser.keys([Key.Ctrl, "z", Key.NULL]);
    await expect(editor).not.toHaveText(expect.stringContaining("Help draft"));
  });
});
