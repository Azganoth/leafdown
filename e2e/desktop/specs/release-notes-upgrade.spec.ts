import { $, browser, expect } from "@wdio/globals";
import { readFile } from "node:fs/promises";

import { getDesktopE2ERunContext } from "../support/runContext.js";

describe("release notes after an upgrade", () => {
  it("automatically shows current notes once and records the seen version", async () => {
    const { releaseNotesPath } = await getDesktopE2ERunContext();
    await expect($("aria/Changes in Leafdown 0.1.0-alpha.1")).toBeDisplayed();
    await expect($("aria/Initial internal alpha release.")).toBeDisplayed();

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
      { timeoutMsg: "Upgrade release-note state was not persisted." },
    );
    await browser.keys("Escape");
    await expect($("aria/Changes in Leafdown 0.1.0-alpha.1")).not.toExist();
  });
});
