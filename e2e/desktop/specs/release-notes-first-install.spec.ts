import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu } from "../support/ui.js";

describe("release notes on first installation", () => {
  it("stays closed automatically and opens both bundled Help surfaces while offline", async () => {
    const { releaseNotesPath } = await getDesktopE2ERunContext();
    await expect($("aria/Help")).toBeDisplayed();
    await expect($("aria/What's new")).not.toExist();

    await browser.execute(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.fetch = () => Promise.reject(new Error("Network disabled for release notes test."));
    });

    await openMenu("Help");
    await (await findMenuItem((text) => text.startsWith("What's new"))).click();
    await expect($("aria/Changes in Leafdown 0.1.0-alpha.1")).toBeDisplayed();
    await expect($("aria/Initial internal alpha release.")).toBeDisplayed();
    await browser.keys("Escape");
    await expect($("aria/Changes in Leafdown 0.1.0-alpha.1")).not.toExist();

    await openMenu("Help");
    await (await findMenuItem((text) => text === "Changelog")).click();
    await expect($("aria/All bundled Leafdown release notes.")).toBeDisplayed();
    await expect($("aria/Initial internal alpha release.")).toBeDisplayed();
    const viewportSelector = "[role='dialog'] [data-slot='scroll-area-viewport']";
    await browser.waitUntil(
      () =>
        browser.execute((selector) => {
          const viewport = document.querySelector<HTMLElement>(selector);
          return Boolean(viewport && viewport.scrollHeight > viewport.clientHeight);
        }, viewportSelector),
      { timeoutMsg: "Changelog content did not become scrollable." },
    );
    const scrollState = await browser.execute((selector) => {
      const viewport = document.querySelector<HTMLElement>(selector);
      viewport?.focus();
      return {
        focused: document.activeElement === viewport,
        overflow: viewport ? viewport.scrollHeight - viewport.clientHeight : 0,
      };
    }, viewportSelector);
    expect(scrollState.focused).toBe(true);
    expect(scrollState.overflow).toBeGreaterThan(0);
    const scrolledTop = await browser.execute((selector) => {
      const viewport = document.querySelector<HTMLElement>(selector);
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
      return viewport?.scrollTop ?? 0;
    }, viewportSelector);
    expect(scrolledTop).toBeGreaterThan(0);
    await expect($("[data-session-mode='welcome']")).toExist();
    await browser.keys("Escape");

    await browser.waitUntil(
      async () => {
        try {
          const state = JSON.parse(await readFile(releaseNotesPath, "utf8")) as Record<
            string,
            unknown
          >;
          return (
            state.lastVersion === "0.1.0-alpha.1" &&
            Array.isArray(state.seenVersions) &&
            state.seenVersions.includes("0.1.0-alpha.1")
          );
        } catch {
          return false;
        }
      },
      { timeoutMsg: "Manual What's new viewing was not persisted." },
    );
  });
});
