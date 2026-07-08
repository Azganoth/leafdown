import { isCancellationError } from "./cancellation";
import type { MessageData } from "./messages";
import { notifyError } from "./toast";

export interface UnexpectedErrorContext {
  componentStack?: string;
  operation?: string;
  source?: string;
}

type UnexpectedErrorContextInput = UnexpectedErrorContext | string;
export interface UnexpectedErrorLogEntry {
  componentStack?: string;
  contextLabel?: string;
  errorMessage: string;
  errorName: string;
  errorStack?: string;
  message: string;
}

export type UnexpectedErrorReporter = (entry: UnexpectedErrorLogEntry) => Promise<void> | void;

const isMessageLike = (value: unknown): value is { message: string } =>
  typeof value === "object" &&
  value !== null &&
  "message" in value &&
  typeof value.message === "string";

const UNEXPECTED_ERROR_DEDUPE_WINDOW_MS = 1000;
const installedUnexpectedErrorHandlers = new WeakMap<EventTarget, () => void>();
const unexpectedErrorReporters = new Set<UnexpectedErrorReporter>();
let lastUnexpectedErrorLog: { loggedAt: number; key: string } | null = null;

export class UnknownThrownError extends Error {
  constructor(readonly thrownValue: unknown) {
    super(getThrownValueMessage(thrownValue), { cause: thrownValue });
    this.name = "UnknownThrownError";
  }
}

export const toError = (error: unknown) =>
  error instanceof Error ? error : new UnknownThrownError(error);

export const getErrorDescription = (error: unknown) => {
  const message = toError(error).message;

  return message || undefined;
};

export const addUnexpectedErrorReporter = (reporter: UnexpectedErrorReporter) => {
  unexpectedErrorReporters.add(reporter);

  return () => {
    unexpectedErrorReporters.delete(reporter);
  };
};

export const handleUnexpectedError = (error: unknown, context?: UnexpectedErrorContextInput) => {
  if (isCancellationError(error)) {
    return;
  }

  const normalizedError = toError(error);

  if (!shouldLogUnexpectedError(normalizedError, context)) {
    return;
  }

  const details = getUnexpectedErrorLogDetails(context);
  const message = getUnexpectedErrorLogMessage(context);

  if (details) {
    console.error(message, normalizedError, details);
  } else {
    console.error(message, normalizedError);
  }

  reportUnexpectedError(normalizedError, context, message);
};

export const notifyOperationFailure = (
  titleOrMessage: MessageData | string,
  error: unknown,
  context?: UnexpectedErrorContextInput,
) => {
  if (isCancellationError(error)) {
    return;
  }

  const normalizedError = toError(error);
  const description = normalizedError.message || undefined;

  notifyError(
    typeof titleOrMessage === "string"
      ? { title: titleOrMessage, description }
      : { ...titleOrMessage, description: titleOrMessage.description ?? description },
  );
  handleUnexpectedError(normalizedError, context);
};

export const installUnexpectedErrorHandlers = (target: Window = window) => {
  const existingCleanup = installedUnexpectedErrorHandlers.get(target);

  if (existingCleanup) {
    return existingCleanup;
  }

  const handleErrorEvent = (event: ErrorEvent) => {
    event.preventDefault();
    handleUnexpectedError(event.error ?? event.message, "window.error");
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    event.preventDefault();
    handleUnexpectedError(event.reason, "window.unhandledrejection");
  };

  target.addEventListener("error", handleErrorEvent);
  target.addEventListener("unhandledrejection", handleUnhandledRejection);

  const cleanup = () => {
    target.removeEventListener("error", handleErrorEvent);
    target.removeEventListener("unhandledrejection", handleUnhandledRejection);
    installedUnexpectedErrorHandlers.delete(target);
  };
  installedUnexpectedErrorHandlers.set(target, cleanup);

  return cleanup;
};

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const getThrownValueMessage = (value: unknown) => {
  if (typeof value === "string") {
    return value || "Unknown thrown value.";
  }

  if (isMessageLike(value)) {
    return value.message || "Unknown thrown value.";
  }

  return "Unknown thrown value.";
};

const getUnexpectedErrorLogMessage = (context?: UnexpectedErrorContextInput) => {
  const contextLabel = getUnexpectedErrorContextLabel(context);

  return contextLabel ? `Unexpected error (${contextLabel}).` : "Unexpected error.";
};

const shouldLogUnexpectedError = (error: Error, context?: UnexpectedErrorContextInput) => {
  const key = getUnexpectedErrorDedupeKey(error, context);
  const loggedAt = Date.now();

  if (
    lastUnexpectedErrorLog?.key === key &&
    loggedAt - lastUnexpectedErrorLog.loggedAt < UNEXPECTED_ERROR_DEDUPE_WINDOW_MS
  ) {
    return false;
  }

  lastUnexpectedErrorLog = { key, loggedAt };
  return true;
};

const getUnexpectedErrorDedupeKey = (error: Error, context?: UnexpectedErrorContextInput) =>
  [
    getUnexpectedErrorContextLabel(context),
    getUnexpectedErrorComponentStack(context),
    error.name,
    error.message,
  ].join("\n");

const getUnexpectedErrorLogDetails = (context?: UnexpectedErrorContextInput) => {
  const componentStack = getUnexpectedErrorComponentStack(context);

  return componentStack ? { componentStack } : undefined;
};

const reportUnexpectedError = (
  error: Error,
  context: UnexpectedErrorContextInput | undefined,
  message: string,
) => {
  if (unexpectedErrorReporters.size === 0) {
    return;
  }

  const entry: UnexpectedErrorLogEntry = {
    componentStack: getUnexpectedErrorComponentStack(context),
    contextLabel: getUnexpectedErrorContextLabel(context),
    errorMessage: error.message,
    errorName: error.name,
    errorStack: error.stack,
    message,
  };

  for (const reporter of unexpectedErrorReporters) {
    try {
      void Promise.resolve(reporter(entry)).catch(() => undefined);
    } catch {
      // Reporter failures must not recurse through the unexpected-error path.
    }
  }
};

const getUnexpectedErrorComponentStack = (context?: UnexpectedErrorContextInput) => {
  if (!context || typeof context === "string") {
    return undefined;
  }

  return context.componentStack?.trim() || undefined;
};

const getUnexpectedErrorContextLabel = (context?: UnexpectedErrorContextInput) => {
  if (!context) {
    return undefined;
  }

  if (typeof context === "string") {
    return context;
  }

  return [context.source, context.operation].filter(Boolean).join(": ") || undefined;
};
