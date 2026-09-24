import { $, browser, expect } from "@wdio/globals";

import { openMenu } from "../support/ui.js";

describe("desktop support links", () => {
  it("opens both feedback forms through the native opener", async () => {
    for (const label of ["Report issue", "Request feature"]) {
      await openMenu("Help");
      await $(`aria/${label}`).click();

      await expect($("aria/Could not open the link.")).not.toExist();
      await expect($("aria/Help")).toBeDisplayed();
      expect(await browser.getUrl()).not.toContain("github.com");
    }
  });
});
