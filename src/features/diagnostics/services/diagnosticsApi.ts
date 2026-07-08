import { invoke } from "@tauri-apps/api/core";

export const GET_DIAGNOSTICS_RUNTIME_COMMAND = "get_diagnostics_runtime";
export const GET_DIAGNOSTICS_SUMMARY_COMMAND = "get_diagnostics_summary";

/* NOTE: src-tauri/src/diagnostics.rs (DiagnosticsRuntimeSummary). */
export interface DiagnosticsRuntimeSummary {
  runId: string;
}

/* NOTE: src-tauri/src/diagnostics.rs (DiagnosticsSummary). */
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

/* NOTE: src-tauri/src/diagnostics.rs (DiagnosticsError). */
export type DiagnosticsError =
  | { kind: "logDirectoryUnavailable"; message: string }
  | { kind: "createLogDirectoryFailed"; path: string; message: string };

export const getDiagnosticsSummary = () =>
  invoke<DiagnosticsSummary>(GET_DIAGNOSTICS_SUMMARY_COMMAND);

export const getDiagnosticsRuntime = () =>
  invoke<DiagnosticsRuntimeSummary>(GET_DIAGNOSTICS_RUNTIME_COMMAND);
