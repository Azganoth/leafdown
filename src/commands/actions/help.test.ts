import { describe, expect, it, vi } from "vitest";

import { toastManager } from "@/lib/toast";
import { countTauriApiCalls, mockTauriApiCommand } from "@/test/utils/tauriApi";

import { useCommandUIStore } from "../stores/commandUi";
import { openAbout, openDevTools, openDiagnostics } from "./help";

describe("help actions", () => {
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
