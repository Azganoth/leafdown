import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import type { DiagnosticsSummary } from "@/features/diagnostics";
import { setupClipboardMock } from "@/test/mocks/clipboard";
import { countTauriApiCalls, mockTauriApiCommand } from "@/test/utils/tauriApi";

import { useCommandUIStore } from "../stores/commandUi";
import { copyDiagnosticsSummary, openAbout, openDevTools, openLogsFolder } from "./help";

const TEST_DIAGNOSTICS_SUMMARY = {
  appIdentifier: "com.azganoth.leafdown",
  appName: "Leafdown",
  appVersion: "0.1.0",
  architecture: "x86_64",
  logDirectoryPath: "C:/Users/Test/AppData/Local/com.azganoth.leafdown/logs",
  logFileCount: 5,
  logFileName: "leafdown",
  logFilePath: "C:/Users/Test/AppData/Local/com.azganoth.leafdown/logs/leafdown.log",
  logMaxFileSizeBytes: 1_048_576,
  operatingSystem: "windows",
} satisfies DiagnosticsSummary;

const { clipboard } = setupClipboardMock();

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

  it("opens the local logs folder from diagnostics metadata", async () => {
    mockTauriApiCommand("getDiagnosticsSummary", () => TEST_DIAGNOSTICS_SUMMARY);

    await openLogsFolder();

    expect(countTauriApiCalls("getDiagnosticsSummary")).toBe(1);
    expect(openPath).toHaveBeenCalledWith(TEST_DIAGNOSTICS_SUMMARY.logDirectoryPath);
  });

  it("reports log folder opening failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockTauriApiCommand("getDiagnosticsSummary", () => {
      throw new Error("logs unavailable");
    });

    await openLogsFolder();

    expect(toast.error).toHaveBeenCalledWith("Could not open logs folder.", {
      description: "logs unavailable",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (help.openLogsFolder).",
      expect.any(Error),
    );
  });

  it("copies a diagnostics summary to the clipboard", async () => {
    mockTauriApiCommand("getDiagnosticsSummary", () => TEST_DIAGNOSTICS_SUMMARY);

    await copyDiagnosticsSummary();

    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Leafdown diagnostics"),
    );
    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining(TEST_DIAGNOSTICS_SUMMARY.logDirectoryPath),
    );
    expect(toast.success).toHaveBeenCalledWith("Diagnostics summary copied.");
  });

  it("reports diagnostics summary copy failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockTauriApiCommand("getDiagnosticsSummary", () => TEST_DIAGNOSTICS_SUMMARY);
    clipboard.writeText.mockRejectedValue(new Error("clipboard denied"));

    await copyDiagnosticsSummary();

    expect(toast.error).toHaveBeenCalledWith("Could not copy diagnostics summary.", {
      description: "clipboard denied",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Unexpected error (help.copyDiagnosticsSummary).",
      expect.any(Error),
    );
  });

  it("opens about dialog through UI store", () => {
    useCommandUIStore.getState().setAboutOpen(false);
    openAbout();
    expect(useCommandUIStore.getState().aboutOpen).toBe(true);
  });
});
