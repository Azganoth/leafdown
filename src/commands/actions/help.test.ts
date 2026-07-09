import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

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

    expect(toast.error).toHaveBeenCalledWith("Could not open DevTools.", {
      description: "DevTools unavailable",
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
