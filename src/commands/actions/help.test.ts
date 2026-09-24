import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { toastManager } from "@/lib/toast";
import { countTauriApiCalls, mockTauriApiCommand } from "@/test/utils/tauriApi";

import { useCommandUIStore } from "../stores/commandUi";
import { openAbout, openDevTools, openDiagnostics, reportIssue, requestFeature } from "./help";

describe("help actions", () => {
  it("opens the repository forms without local context or prefilled data", async () => {
    await reportIssue();
    await requestFeature();

    expect(vi.mocked(openUrl).mock.calls).toEqual([
      ["https://github.com/Azganoth/leafdown/issues/new?template=bug.yml"],
      ["https://github.com/Azganoth/leafdown/issues/new?template=feature.yml"],
    ]);
  });

  it("reports external opening failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(openUrl).mockRejectedValue(new Error("Browser unavailable"));

    await reportIssue();

    expect(toastManager.add).toHaveBeenCalledWith({
      description: "Browser unavailable",
      title: "Could not open the link.",
      type: "error",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (help.openFeedbackForm).",
      expect.any(Error),
    );
  });

  it("opens webview DevTools through the backend command", async () => {
    mockTauriApiCommand("openWebviewDevtools", () => undefined);

    await openDevTools();

    expect(countTauriApiCalls("openWebviewDevtools")).toBe(1);
  });

  it("reports DevTools opening failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockTauriApiCommand("openWebviewDevtools", () => {
      throw new Error("DevTools unavailable");
    });

    await openDevTools();

    expect(toastManager.add).toHaveBeenCalledWith({
      description: "DevTools unavailable",
      title: "Could not open DevTools.",
      type: "error",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (help.openDevTools).",
      expect.any(Error),
    );
  });

  it("opens diagnostics dialog through UI store", () => {
    useCommandUIStore.getState().setDiagnosticsOpen(false);
    openDiagnostics();
    expect(useCommandUIStore.getState().diagnosticsOpen).toBe(true);
  });

  it("opens about dialog through UI store", () => {
    useCommandUIStore.getState().setAboutOpen(false);
    openAbout();
    expect(useCommandUIStore.getState().aboutOpen).toBe(true);
  });
});
