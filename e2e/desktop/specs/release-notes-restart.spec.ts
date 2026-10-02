import { $, browser, expect } from "@wdio/globals";

import { findMenuItem, openMenu } from "../support/ui.js";

describe("release notes after restart", () => {
  it("does not repeat automatic notes and still permits manual reopening", async () => {
    await expect($("aria/Help")).toBeDisplayed();
    await expect($("aria/Changes in Leafdown 0.1.0-alpha.1")).not.toExist();

    await openMenu("Help");
    await (await findMenuItem((text) => text.startsWith("What's new"))).click();
    await expect($("aria/Initial internal alpha release.")).toBeDisplayed();
    await browser.keys("Escape");
    await expect($("aria/Changes in Leafdown 0.1.0-alpha.1")).not.toExist();
  });
});
