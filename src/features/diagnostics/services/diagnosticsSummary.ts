import type { DiagnosticsSummary } from "./diagnosticsApi";

const BYTES_PER_MEBIBYTE = 1_048_576;

export const formatDiagnosticsSummary = (summary: DiagnosticsSummary, generatedAt = new Date()) =>
  [
    "Leafdown diagnostics",
    `Generated: ${generatedAt.toISOString()}`,
    `App: ${summary.appName} ${summary.appVersion}`,
    `Identifier: ${summary.appIdentifier}`,
    `System: ${summary.operatingSystem} ${summary.architecture}`,
    `Logs directory: ${summary.logDirectoryPath}`,
    `Current log file: ${summary.logFilePath}`,
    `Log retention: ${summary.logFileCount} files, ${formatLogSize(summary.logMaxFileSizeBytes)} each`,
    "Privacy: logs stay on this device and are not uploaded automatically.",
    "Note: diagnostics may include local file paths, but not Markdown document contents.",
  ].join("\n");

const formatLogSize = (bytes: number) => {
  if (bytes > 0 && bytes % BYTES_PER_MEBIBYTE === 0) {
    return `${bytes / BYTES_PER_MEBIBYTE} MiB`;
  }

  return `${bytes} bytes`;
};
