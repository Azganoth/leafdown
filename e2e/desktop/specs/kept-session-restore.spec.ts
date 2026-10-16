import { $, expect } from "@wdio/globals";
import path from "node:path";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { countDocumentTabs, findDocumentTab } from "../support/ui.js";

const ACTIVE_EDITOR = "[data-testid=active-document-host] .ProseMirror";

describe("desktop kept session after restart", () => {
  it("reopens the tabs with their unsaved edits in a fresh process", async () => {
    const { callouts } = await getDesktopE2ERunContext();
    const calloutsName = path.basename(callouts.path);

    const untitledTab = await findDocumentTab("Untitled");
    const calloutsTab = await findDocumentTab(calloutsName);

    expect(await countDocumentTabs()).toBe(2);
    await expect(untitledTab).toHaveAttribute("aria-selected", "true");
    await expect(untitledTab).toHaveAttribute("aria-label", "Untitled, unsaved");
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Untitled kept marker"));

    await expect(calloutsTab).toHaveAttribute("aria-label", `${calloutsName}, unsaved`);
    await calloutsTab.click();
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Kept edit marker"));
  });
});
