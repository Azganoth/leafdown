import { $, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";

import { getDiagnosticsSummary } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu } from "../support/ui.js";

describe("desktop persistence before restart", () => {
  it("changes the sidebar setting through the assembled menu and persists it", async () => {
    const { persistenceEvidencePath, settingsPath } = await getDesktopE2ERunContext();
    const diagnostics = await getDiagnosticsSummary();

    await openMenu("View");
    const sidebarItem = await findMenuItem((text) => text.startsWith("Toggle sidebar"));
    await expect(sidebarItem).toHaveAttribute("aria-checked", "true");
    await sidebarItem.click();

    await expect($("aria/Article navigator")).not.toExist();

    let persistedSettings: Record<string, unknown> | undefined;
    await browser.waitUntil(
      async () => {
        try {
          persistedSettings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<
            string,
            unknown
          >;
          return persistedSettings.sidebarVisible === false;
        } catch {
          return false;
        }
      },
      { timeoutMsg: "The sidebar setting was not persisted before restart." },
    );

    await writeFile(
      persistenceEvidencePath,
      `${JSON.stringify({ firstRunId: diagnostics.runId, persistedSettings }, null, 2)}\n`,
    );
  });
});
