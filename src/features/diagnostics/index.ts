export { DiagnosticsDialog } from "./components/DiagnosticsDialog";
export {
  formatDiagnosticEvent,
  formatUnexpectedErrorDiagnostic,
  getDiagnosticOperationDurationMs,
  installUnexpectedErrorDiagnostics,
  shouldWriteSlowOperationDiagnostic,
  SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
  writeDiagnosticError,
  writeDiagnosticInfo,
  writeDiagnosticWarn,
  writeUnexpectedErrorDiagnostic,
  type DiagnosticEventPayload,
} from "./services/diagnosticLog";
export {
  GET_DIAGNOSTICS_SUMMARY_COMMAND,
  getDiagnosticsSummary,
  type DiagnosticsError,
  type DiagnosticsSummary,
} from "./services/diagnosticsApi";
export { formatDiagnosticsSummary } from "./services/diagnosticsSummary";
