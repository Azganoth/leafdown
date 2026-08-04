import { $, browser, expect } from "@wdio/globals";

interface DiagnosticsSummary {
  appIdentifier: string;
  runId: string;
}

describe("desktop diagnostics", () => {
  it("opens Diagnostics through Help and corroborates the summary through real IPC", async () => {
    const helpMenu = $("aria/Help");
    await helpMenu.click();
    await browser.keys("Enter");
    await $("aria/Diagnostics...").click();

    const dialog = $("aria/Diagnostics");
    await expect(dialog).toBeDisplayed();

    const summaryField = $("aria/Diagnostics summary");
    await expect(summaryField).toHaveValue(expect.stringContaining("Leafdown diagnostics"));

    const summary = await browser.tauri.execute(
      ({ core }) => core.invoke("get_diagnostics_summary") as Promise<DiagnosticsSummary>,
    );
    const summaryText = await summaryField.getValue();

    expect(summary.appIdentifier).toBe("com.azganoth.leafdown.e2e");
    expect(summary.runId).not.toHaveLength(0);
    expect(summaryText).toContain(`Identifier: ${summary.appIdentifier}`);
    expect(summaryText).toContain(`Run: ${summary.runId}`);

    await browser.execute((runId) => {
      console.info(JSON.stringify({ event: "desktopE2eFrontendMarker", runId }));
    }, summary.runId);

    if (process.env.LEAFDOWN_E2E_FORCE_FAILURE === "1") {
      throw new Error("Forced desktop E2E failure for artifact verification.");
    }
  });
});
