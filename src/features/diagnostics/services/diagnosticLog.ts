import { error as writeLogError } from "@tauri-apps/plugin-log";

import {
  addUnexpectedErrorReporter,
  type UnexpectedErrorLogEntry,
  type UnexpectedErrorReporter,
} from "@/lib/errors";

const MAX_DIAGNOSTIC_FIELD_LENGTH = 12_000;

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
}

export const installUnexpectedErrorDiagnostics = () => {
  const reporter: UnexpectedErrorReporter = (entry) => {
    void writeUnexpectedErrorDiagnostic(entry);
  };

  return addUnexpectedErrorReporter(reporter);
};

export const writeUnexpectedErrorDiagnostic = async (entry: UnexpectedErrorLogEntry) => {
  await writeLogError(formatUnexpectedErrorDiagnostic(entry));
};

export const formatUnexpectedErrorDiagnostic = (entry: UnexpectedErrorLogEntry) =>
  `[frontend] ${JSON.stringify(createUnexpectedErrorDiagnosticPayload(entry))}`;

const createUnexpectedErrorDiagnosticPayload = (
  entry: UnexpectedErrorLogEntry,
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
});

const truncateDiagnosticField = (value: string | undefined) => {
  if (!value || value.length <= MAX_DIAGNOSTIC_FIELD_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_DIAGNOSTIC_FIELD_LENGTH)}... [truncated]`;
};
