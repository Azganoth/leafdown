import { invoke } from "@tauri-apps/api/core";

export const GET_DIAGNOSTICS_SUMMARY_COMMAND = "get_diagnostics_summary";

export interface DiagnosticsSummary {
  appIdentifier: string;
  appName: string;
  appVersion: string;
  architecture: string;
  logDirectoryPath: string;
  logFileCount: number;
  logFileName: string;
  logFilePath: string;
  logMaxFileSizeBytes: number;
  operatingSystem: string;
  runId: string;
}

export type DiagnosticsError =
  | { kind: "logDirectoryUnavailable"; message: string }
  | { kind: "createLogDirectoryFailed"; path: string; message: string };

export const getDiagnosticsSummary = () =>
  invoke<DiagnosticsSummary>(GET_DIAGNOSTICS_SUMMARY_COMMAND);
