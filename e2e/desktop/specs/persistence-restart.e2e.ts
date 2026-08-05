import { $, browser, expect } from "@wdio/globals";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ARTIFACTS_DIR } from "../support/artifacts.js";
import { getDiagnosticsSummary } from "../support/diagnostics.js";
import { getDesktopE2ERunContext } from "../support/runContext.js";
import { findMenuItem, openMenu } from "../support/ui.js";

interface PersistencePhaseOneEvidence {
  firstRunId: string;
}

describe("desktop persistence after restart", () => {
  it("restores the sidebar setting in a fresh packaged-app process", async () => {
    const { persistenceEvidencePath, settingsPath } = await getDesktopE2ERunContext();
    const phaseOne = JSON.parse(
      await readFile(persistenceEvidencePath, "utf8"),
    ) as PersistencePhaseOneEvidence;
    const diagnostics = await getDiagnosticsSummary();

    expect(diagnostics.runId).not.toBe(phaseOne.firstRunId);

    await openMenu("View");
    const sidebarItem = await findMenuItem((text) => text.startsWith("Toggle sidebar"));
    await expect(sidebarItem).toHaveAttribute("aria-checked", "false");
    await browser.keys("Escape");
    await expect($("aria/Article navigator")).not.toExist();

    const persistedSettings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(persistedSettings.sidebarVisible).toBe(false);

    await writeFile(
      path.join(ARTIFACTS_DIR, "restart-evidence.json"),
      `${JSON.stringify(
        {
          firstRunId: phaseOne.firstRunId,
          persistedSidebarVisible: persistedSettings.sidebarVisible,
          secondRunId: diagnostics.runId,
        },
        null,
        2,
      )}\n`,
    );
  });
});
