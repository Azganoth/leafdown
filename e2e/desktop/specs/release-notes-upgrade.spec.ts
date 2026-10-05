import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";

import { CURRENT_RELEASE_HIGHLIGHT, CURRENT_VERSION } from "../support/releaseNotes.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";

describe("release notes after an upgrade", () => {
  it("automatically shows current notes once and records the seen version", async () => {
    const { releaseNotesPath } = await getDesktopE2ERunContext();
    await expect($(`aria/Changes in Leafdown ${CURRENT_VERSION}`)).toBeDisplayed();
    await expect($("[role='dialog'] article")).toHaveText(
      expect.stringContaining(CURRENT_RELEASE_HIGHLIGHT),
    );

    await browser.waitUntil(
      async () => {
        try {
          const state = JSON.parse(await readFile(releaseNotesPath, "utf8")) as Record<
            string,
            unknown
          >;
          return (
            state.lastVersion === CURRENT_VERSION &&
            Array.isArray(state.seenVersions) &&
            state.seenVersions.includes(CURRENT_VERSION)
          );
        } catch {
          return false;
        }
      },
      { timeoutMsg: "Upgrade release-note state was not persisted." },
    );
    await browser.keys("Escape");
    await expect($(`aria/Changes in Leafdown ${CURRENT_VERSION}`)).not.toExist();
  });
});
