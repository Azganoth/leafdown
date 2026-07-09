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
export type DiagnosticJsonValue =
  | DiagnosticJsonValue[]
  | { [key: string]: DiagnosticJsonValue }
  | boolean
  | null
  | number
  | string
  | undefined;

export interface DiagnosticEventPayload {
  event: string;
  [key: string]: DiagnosticJsonValue;
}

export interface SlowOperationDiagnosticOptions {
  context?: Record<string, DiagnosticJsonValue>;
  feature: string;
  operation: string;
  startedAtMs: number;
  thresholdMs?: number;
}

interface UnexpectedErrorDiagnosticPayload extends DiagnosticEventPayload {
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

export const writeUnexpectedErrorDiagnostic = (entry: UnexpectedErrorLogEntry) =>
  writeDiagnosticError(createUnexpectedErrorDiagnosticPayload(entry));

export const formatUnexpectedErrorDiagnostic = (entry: UnexpectedErrorLogEntry) =>
  formatDiagnosticEvent(createUnexpectedErrorDiagnosticPayload(entry));

export const writeDiagnosticInfo = (payload: DiagnosticEventPayload) =>
  writeDiagnosticEvent("info", payload);

export const writeDiagnosticWarn = (payload: DiagnosticEventPayload) =>
  writeDiagnosticEvent("warn", payload);

export const writeDiagnosticError = (payload: DiagnosticEventPayload) =>
  writeDiagnosticEvent("error", payload);

export const formatDiagnosticEvent = (payload: DiagnosticEventPayload) =>
  JSON.stringify(normalizeDiagnosticPayload(payload));

export const getDiagnosticOperationDurationMs = (startedAtMs: number) =>
  Math.max(0, Math.round(performance.now() - startedAtMs));

export const startDiagnosticOperationTimer = () => performance.now();

export const shouldWriteSlowOperationDiagnostic = (
  durationMs: number,
  thresholdMs = SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
) => durationMs >= thresholdMs;

export const writeSlowOperationDiagnostic = ({
  context = {},
  feature,
  operation,
  startedAtMs,
  thresholdMs = SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS,
}: SlowOperationDiagnosticOptions) => {
  const durationMs = getDiagnosticOperationDurationMs(startedAtMs);

  if (!shouldWriteSlowOperationDiagnostic(durationMs, thresholdMs)) {
    return false;
  }

  void writeDiagnosticInfo({
    ...context,
    durationMs,
    event: "operationTiming",
    feature,
    operation,
    thresholdMs,
  });

  return true;
};

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

const normalizeDiagnosticPayload = (
  payload: DiagnosticEventPayload,
): Record<string, DiagnosticJsonValue> =>
  Object.fromEntries(
    Object.entries(payload).flatMap(([key, value]) => {
      const normalizedValue = normalizeDiagnosticValue(value);

      return normalizedValue === undefined ? [] : [[key, normalizedValue]];
    }),
  );

const normalizeDiagnosticValue = (value: DiagnosticJsonValue): DiagnosticJsonValue => {
  if (typeof value === "string") {
    return truncateDiagnosticField(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeDiagnosticValue(entry))
      .filter((entry) => entry !== undefined);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const normalizedEntry = normalizeDiagnosticValue(entry);

        return normalizedEntry === undefined ? [] : [[key, normalizedEntry]];
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
