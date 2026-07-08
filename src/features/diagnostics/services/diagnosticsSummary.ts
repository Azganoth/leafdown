import { formatFileSize } from "@/lib/formatFileSize";

import type { DiagnosticsSummary } from "./diagnosticsApi";

export const formatDiagnosticsSummary = (summary: DiagnosticsSummary, generatedAt = new Date()) =>
  [
    "Leafdown diagnostics",
    `Generated: ${generatedAt.toISOString()}`,
    `App: ${summary.appName} ${summary.appVersion}`,
    `Identifier: ${summary.appIdentifier}`,
    `System: ${summary.operatingSystem} ${summary.architecture}`,
    `Logs directory: ${summary.logDirectoryPath}`,
    `Current log file: ${summary.logFilePath}`,
    `Log retention: current log plus ${summary.logFileCount} retained files, ${formatFileSize(summary.logMaxFileSizeBytes)} each`,
    "Privacy: logs stay on this device and are not uploaded automatically.",
  ].join("\n");
