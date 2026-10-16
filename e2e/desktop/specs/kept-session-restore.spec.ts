import { $, expect } from "@wdio/globals";
import path from "node:path";

import { getDesktopE2ERunContext } from "../support/runContext.js";
import { countDocumentTabs, findDocumentTab } from "../support/ui.js";

const ACTIVE_EDITOR = "[data-testid=active-document-host] .ProseMirror";

describe("desktop kept session after restart", () => {
  it("reopens the tabs with their unsaved edits in a fresh process", async () => {
    const { citations } = await getDesktopE2ERunContext();
    const citationsName = path.basename(citations.path);

    const untitledTab = await findDocumentTab("Untitled");
    const citationsTab = await findDocumentTab(citationsName);

    expect(await countDocumentTabs()).toBe(2);
    await expect(untitledTab).toHaveAttribute("aria-selected", "true");
    await expect(untitledTab).toHaveAttribute("aria-label", "Untitled, unsaved");
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Untitled kept marker"));

    await expect(citationsTab).toHaveAttribute("aria-label", `${citationsName}, unsaved`);
    await citationsTab.click();
    await expect($(ACTIVE_EDITOR)).toHaveText(expect.stringContaining("Kept edit marker"));
  });
});
