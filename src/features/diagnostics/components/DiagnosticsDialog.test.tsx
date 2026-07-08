import { openPath } from "@tauri-apps/plugin-opener";
import { fireEvent } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it } from "vitest";

import type { DiagnosticsSummary } from "@/features/diagnostics";
import { setupClipboardMock } from "@/test/mocks/clipboard";
import { render, screen, waitFor } from "@/test/utils/react";
import { mockTauriApiCommand } from "@/test/utils/tauriApi";

import { DiagnosticsDialog } from "./DiagnosticsDialog";

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
  runId: "run-test",
} satisfies DiagnosticsSummary;

const { clipboard } = setupClipboardMock();

const renderDiagnosticsDialog = () =>
  render(<DiagnosticsDialog open onOpenChange={() => undefined} />);

const diagnosticsSummaryInput = () =>
  screen.getByLabelText("Diagnostics summary") as HTMLTextAreaElement;

describe("DiagnosticsDialog", () => {
  it("loads and displays diagnostics metadata", async () => {
    mockTauriApiCommand("getDiagnosticsSummary", () => TEST_DIAGNOSTICS_SUMMARY);

    renderDiagnosticsDialog();

    expect(screen.getByRole("dialog", { name: "Diagnostics" })).toBeInTheDocument();
    expect(screen.getByText(/Logs are not uploaded automatically/u)).toBeInTheDocument();

    await waitFor(() => {
      expect(diagnosticsSummaryInput().value).toContain("Leafdown diagnostics");
    });

    expect(diagnosticsSummaryInput().value).toContain("App: Leafdown 0.1.0");
    expect(diagnosticsSummaryInput().value).toContain("Run: run-test");
    expect(screen.getByText(TEST_DIAGNOSTICS_SUMMARY.logDirectoryPath)).toBeInTheDocument();
    expect(screen.getByText(TEST_DIAGNOSTICS_SUMMARY.logFilePath)).toBeInTheDocument();
    expect(screen.getByText("Current log plus 5 retained files, 1 MB each")).toBeInTheDocument();
  });

  it("copies the displayed diagnostics summary", async () => {
    mockTauriApiCommand("getDiagnosticsSummary", () => TEST_DIAGNOSTICS_SUMMARY);

    renderDiagnosticsDialog();

    await waitFor(() => {
      expect(diagnosticsSummaryInput().value).toContain("Leafdown diagnostics");
    });
    expect(navigator.clipboard).toBe(clipboard);

    const copyButton = screen.getByRole("button", { name: "Copy summary" });
    await waitFor(() => {
      expect(copyButton).toBeEnabled();
    });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(clipboard.writeText).toHaveBeenCalled();
    });
    const copiedText = clipboard.writeText.mock.calls.at(-1)?.[0] ?? "";

    expect(copiedText).toContain("Leafdown diagnostics");
    expect(copiedText).toContain("App: Leafdown 0.1.0");
    expect(copiedText).toContain("Run: run-test");
    expect(toast.success).toHaveBeenCalledWith("Diagnostics summary copied.");
  });

  it("opens the local logs folder", async () => {
    mockTauriApiCommand("getDiagnosticsSummary", () => TEST_DIAGNOSTICS_SUMMARY);

    renderDiagnosticsDialog();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open logs folder" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Open logs folder" }));

    expect(openPath).toHaveBeenCalledWith(TEST_DIAGNOSTICS_SUMMARY.logDirectoryPath);
  });

  it("shows load failures and retries", async () => {
    let attempts = 0;
    mockTauriApiCommand("getDiagnosticsSummary", () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("diagnostics unavailable");
      }

      return TEST_DIAGNOSTICS_SUMMARY;
    });

    renderDiagnosticsDialog();

    expect(await screen.findByText("diagnostics unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy summary" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(diagnosticsSummaryInput().value).toContain("Leafdown diagnostics");
    });
  });
});
