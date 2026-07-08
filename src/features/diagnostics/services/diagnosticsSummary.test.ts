import { describe, expect, it } from "vitest";

import type { DiagnosticsSummary } from "./diagnosticsApi";
import { formatDiagnosticsSummary } from "./diagnosticsSummary";

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

describe("diagnostics summary", () => {
  it("formats support metadata without log contents", () => {
    const summary = formatDiagnosticsSummary(
      TEST_DIAGNOSTICS_SUMMARY,
      new Date("2026-07-08T12:00:00.000Z"),
    );

    expect(summary).toContain("Leafdown diagnostics");
    expect(summary).toContain("Generated: 2026-07-08T12:00:00.000Z");
    expect(summary).toContain("App: Leafdown 0.1.0");
    expect(summary).toContain("System: windows x86_64");
    expect(summary).toContain(TEST_DIAGNOSTICS_SUMMARY.logDirectoryPath);
    expect(summary).toContain("Log retention: 5 files, 1 MiB each");
    expect(summary).toContain("logs stay on this device");
    expect(summary).toContain("may include local file paths");
    expect(summary).toContain("not Markdown document contents");
  });
});
