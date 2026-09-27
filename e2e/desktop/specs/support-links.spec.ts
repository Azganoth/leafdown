import { $, browser, expect } from "@wdio/globals";

import { waitForDiagnosticRecord } from "../support/diagnostics.js";
import { openMenu } from "../support/ui.js";

describe("desktop support links", () => {
  it("opens both feedback forms through the native opener", async () => {
    for (const [label, template] of [
      ["Report issue", "bug.yml"],
      ["Request feature", "feature.yml"],
    ]) {
      await openMenu("Help");
      await $(`aria/${label}`).click();

      await waitForDiagnosticRecord(
        (record) =>
          record.event === "desktopE2eOpenerSuppressed" &&
          record.command === "openUrl" &&
          record.request === `https://github.com/Azganoth/leafdown/issues/new?template=${template}`,
      );
      await expect($("aria/Could not open the link.")).not.toExist();
      await expect($("aria/Help")).toBeDisplayed();
      expect(await browser.getUrl()).not.toContain("github.com");
    }
  });
});
