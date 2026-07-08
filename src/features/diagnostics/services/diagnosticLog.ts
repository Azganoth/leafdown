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

import { getDiagnosticsRuntime } from "./diagnosticsApi";

const MAX_DIAGNOSTIC_FIELD_LENGTH = 12_000;
export const SLOW_OPERATION_DIAGNOSTIC_THRESHOLD_MS = 1_000;

interface UnexpectedErrorDiagnosticOptions {
  runId?: string;
}

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

interface DiagnosticEventOptions {
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

let diagnosticsRunId: string | undefined;
let diagnosticsRunIdPromise: Promise<string | undefined> | null = null;

export const resetDiagnosticsRunIdForTests = () => {
  diagnosticsRunId = undefined;
  diagnosticsRunIdPromise = null;
};

export const installUnexpectedErrorDiagnostics = () => {
  void getDiagnosticsRunId();

  const reporter: UnexpectedErrorReporter = (entry) => {
    void writeUnexpectedErrorDiagnostic(entry);
  };

  return addUnexpectedErrorReporter(reporter);
};

export const writeUnexpectedErrorDiagnostic = async (
  entry: UnexpectedErrorLogEntry,
  options: UnexpectedErrorDiagnosticOptions = {},
) => {
  try {
    await writeLogError(
      formatUnexpectedErrorDiagnostic(entry, {
        runId: options.runId ?? (await getDiagnosticsRunId()),
      }),
    );
  } catch {
    // Diagnostics must never break the app workflow that triggered them.
  }
};

export const formatUnexpectedErrorDiagnostic = (
  entry: UnexpectedErrorLogEntry,
  options: UnexpectedErrorDiagnosticOptions = {},
) => JSON.stringify(createUnexpectedErrorDiagnosticPayload(entry, options));

export const writeDiagnosticInfo = (
  payload: DiagnosticEventPayload,
  options: DiagnosticEventOptions = {},
) => writeDiagnosticEvent("info", payload, options);

export const writeDiagnosticWarn = (
  payload: DiagnosticEventPayload,
  options: DiagnosticEventOptions = {},
) => writeDiagnosticEvent("warn", payload, options);

export const formatDiagnosticEvent = (
  payload: DiagnosticEventPayload,
  options: DiagnosticEventOptions = {},
) =>
  JSON.stringify(
    sanitizeDiagnosticPayload({
      ...payload,
      runId: options.runId,
    }),
  );

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

const writeDiagnosticEvent = async (
  level: DiagnosticLogLevel,
  payload: DiagnosticEventPayload,
  options: DiagnosticEventOptions,
) => {
  try {
    await DIAGNOSTIC_WRITERS[level](
      formatDiagnosticEvent(payload, {
        runId: options.runId ?? (await getDiagnosticsRunId()),
      }),
    );
  } catch {
    // Diagnostics must never break the app workflow that triggered them.
  }
};

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

const getDiagnosticsRunId = () => {
  if (diagnosticsRunId) {
    return Promise.resolve(diagnosticsRunId);
  }

  diagnosticsRunIdPromise ??= getDiagnosticsRuntime()
    .then((runtime) => {
      diagnosticsRunId = runtime.runId;
      return diagnosticsRunId;
    })
    .catch(() => {
      diagnosticsRunIdPromise = null;
      return undefined;
    });

  return diagnosticsRunIdPromise;
};

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
