import { error as writeLogError } from "@tauri-apps/plugin-log";

import {
  addUnexpectedErrorReporter,
  type UnexpectedErrorLogEntry,
  type UnexpectedErrorReporter,
} from "@/lib/errors";

import { getDiagnosticsRuntime } from "./diagnosticsApi";

const MAX_DIAGNOSTIC_FIELD_LENGTH = 12_000;

interface UnexpectedErrorDiagnosticOptions {
  runId?: string;
}

interface UnexpectedErrorDiagnosticPayload {
  componentStack?: string;
  context?: string;
  error: {
    message: string;
    name: string;
    stack?: string;
  };
  event: "frontendUnexpectedError";
  message: string;
  runId?: string;
}

export const installUnexpectedErrorDiagnostics = () => {
  let runId: string | undefined;

  void getDiagnosticsRuntime()
    .then((runtime) => {
      runId = runtime.runId;
    })
    .catch(() => undefined);

  const reporter: UnexpectedErrorReporter = (entry) => {
    void writeUnexpectedErrorDiagnostic(entry, { runId });
  };

  return addUnexpectedErrorReporter(reporter);
};

export const writeUnexpectedErrorDiagnostic = async (
  entry: UnexpectedErrorLogEntry,
  options: UnexpectedErrorDiagnosticOptions = {},
) => {
  await writeLogError(formatUnexpectedErrorDiagnostic(entry, options));
};

export const formatUnexpectedErrorDiagnostic = (
  entry: UnexpectedErrorLogEntry,
  options: UnexpectedErrorDiagnosticOptions = {},
) => JSON.stringify(createUnexpectedErrorDiagnosticPayload(entry, options));

const createUnexpectedErrorDiagnosticPayload = (
  entry: UnexpectedErrorLogEntry,
  options: UnexpectedErrorDiagnosticOptions,
): UnexpectedErrorDiagnosticPayload => ({
  componentStack: truncateDiagnosticField(entry.componentStack),
  context: truncateDiagnosticField(entry.contextLabel),
  error: {
    message: truncateDiagnosticField(entry.errorMessage) ?? "",
    name: truncateDiagnosticField(entry.errorName) ?? "Error",
    stack: truncateDiagnosticField(entry.errorStack),
  },
  event: "frontendUnexpectedError",
  message: truncateDiagnosticField(entry.message) ?? "Unexpected error.",
  runId: truncateDiagnosticField(options.runId),
});

const truncateDiagnosticField = (value: string | undefined) => {
  if (!value || value.length <= MAX_DIAGNOSTIC_FIELD_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_DIAGNOSTIC_FIELD_LENGTH)}... [truncated]`;
};
