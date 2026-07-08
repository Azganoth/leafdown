import type { DiagnosticsSummary } from "./diagnosticsApi";

export const formatDiagnosticsSummary = (summary: DiagnosticsSummary, generatedAt = new Date()) =>
  [
    "Leafdown diagnostics",
    `Generated: ${generatedAt.toISOString()}`,
    `App: ${summary.appName} ${summary.appVersion}`,
    `Identifier: ${summary.appIdentifier}`,
    `System: ${summary.operatingSystem} ${summary.architecture}`,
  ].join("\n");
