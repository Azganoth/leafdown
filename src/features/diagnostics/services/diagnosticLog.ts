import {
  error as writeLogError,
  info as writeLogInfo,
  warn as writeLogWarn,
} from "@tauri-apps/plugin-log";

import {
  addUnexpectedErrorReporter,
  type UnexpectedErrorLogEntry,
  type UnexpectedErrorReporter,
} from "@/lib/errors";

const MAX_DIAGNOSTIC_FIELD_LENGTH = 12_000;
export const SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS = 1_000;

type DiagnosticLogLevel = "error" | "info" | "warn";
type DiagnosticPayloadValue =
  | DiagnosticPayloadValue[]
  | { [key: string]: DiagnosticPayloadValue }
  | boolean
  | null
  | number
  | string
  | undefined;

export interface DiagnosticEventPayload {
  event: string;
  [key: string]: DiagnosticPayloadValue;
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
}

export const installUnexpectedErrorDiagnostics = () => {
  const reporter: UnexpectedErrorReporter = (entry) => {
    void writeUnexpectedErrorDiagnostic(entry);
  };

  return addUnexpectedErrorReporter(reporter);
};

export const writeUnexpectedErrorDiagnostic = async (entry: UnexpectedErrorLogEntry) => {
  try {
    await writeLogError(formatUnexpectedErrorDiagnostic(entry));
  } catch {
    // Diagnostics must never break the app workflow that triggered them.
  }
};

export const formatUnexpectedErrorDiagnostic = (entry: UnexpectedErrorLogEntry) =>
  JSON.stringify(createUnexpectedErrorDiagnosticPayload(entry));

export const writeDiagnosticInfo = (payload: DiagnosticEventPayload) =>
  writeDiagnosticEvent("info", payload);

export const writeDiagnosticWarn = (payload: DiagnosticEventPayload) =>
  writeDiagnosticEvent("warn", payload);

export const formatDiagnosticEvent = (payload: DiagnosticEventPayload) =>
  JSON.stringify(sanitizeDiagnosticPayload(payload));

export const getDiagnosticOperationDurationMs = (startedAtMs: number) =>
  Math.max(0, Math.round(performance.now() - startedAtMs));

export const shouldWriteSlowOperationDiagnostic = (
  durationMs: number,
  thresholdMs = SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
) => durationMs >= thresholdMs;

const DIAGNOSTIC_WRITERS = {
  error: writeLogError,
  info: writeLogInfo,
  warn: writeLogWarn,
} satisfies Record<DiagnosticLogLevel, (message: string) => Promise<void>>;

const writeDiagnosticEvent = async (level: DiagnosticLogLevel, payload: DiagnosticEventPayload) => {
  try {
    await DIAGNOSTIC_WRITERS[level](formatDiagnosticEvent(payload));
  } catch {
    // Diagnostics must never break the app workflow that triggered them.
  }
};

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

const sanitizeDiagnosticPayload = (
  payload: DiagnosticEventPayload,
): Record<string, DiagnosticPayloadValue> =>
  Object.fromEntries(
    Object.entries(payload).flatMap(([key, value]) => {
      const sanitizedValue = sanitizeDiagnosticValue(value);

      return sanitizedValue === undefined ? [] : [[key, sanitizedValue]];
    }),
  );

const sanitizeDiagnosticValue = (value: DiagnosticPayloadValue): DiagnosticPayloadValue => {
  if (typeof value === "string") {
    return truncateDiagnosticField(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeDiagnosticValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const sanitizedEntry = sanitizeDiagnosticValue(entry);

        return sanitizedEntry === undefined ? [] : [[key, sanitizedEntry]];
      }),
    );
  }

  return value;
};

const truncateDiagnosticField = (value: string | undefined) => {
  if (!value || value.length <= MAX_DIAGNOSTIC_FIELD_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_DIAGNOSTIC_FIELD_LENGTH)}... [truncated]`;
};
