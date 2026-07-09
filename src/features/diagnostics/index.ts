export { DiagnosticsDialog } from "./components/DiagnosticsDialog";
export {
  installUnexpectedErrorDiagnostics,
  SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
  startDiagnosticOperationTimer,
  writeDiagnosticError,
  writeDiagnosticInfo,
  writeDiagnosticOperationFailure,
  writeDiagnosticOperationLifecycle,
  writeDiagnosticOperationWarning,
  writeDiagnosticSlowOperation,
  writeDiagnosticUnexpectedError,
  writeDiagnosticWarn,
  type DiagnosticEventPayload,
} from "./services/diagnosticLog";
export {
  GET_DIAGNOSTICS_SUMMARY_COMMAND,
  getDiagnosticsSummary,
  type DiagnosticsError,
  type DiagnosticsSummary,
} from "./services/diagnosticsApi";
export { formatDiagnosticsSummary } from "./services/diagnosticsSummary";
