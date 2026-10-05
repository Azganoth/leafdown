import { $, browser, expect } from "@wdio/globals";

import { CURRENT_RELEASE_HIGHLIGHT, CURRENT_VERSION } from "../support/releaseNotes.js";
import { findMenuItem, openMenu } from "../support/ui.js";

describe("release notes after restart", () => {
  it("does not repeat automatic notes and still permits manual reopening", async () => {
    await expect($("aria/Help")).toBeDisplayed();
    await expect($(`aria/Changes in Leafdown ${CURRENT_VERSION}`)).not.toExist();

    await openMenu("Help");
    await (await findMenuItem((text) => text.startsWith("What's new"))).click();
    await expect($("[role='dialog'] article")).toHaveText(
      expect.stringContaining(CURRENT_RELEASE_HIGHLIGHT),
    );
    await browser.keys("Escape");
    await expect($(`aria/Changes in Leafdown ${CURRENT_VERSION}`)).not.toExist();
  });
});
