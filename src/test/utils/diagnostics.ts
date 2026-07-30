import {
  error as writeLogError,
  info as writeLogInfo,
  warn as writeLogWarn,
} from "@tauri-apps/plugin-log";
import { expect, vi } from "vitest";

export type DiagnosticLogLevel = "error" | "info" | "warn";

type DiagnosticPayload = Record<string, unknown>;

const DIAGNOSTIC_LOG_WRITERS = {
  error: writeLogError,
  info: writeLogInfo,
  warn: writeLogWarn,
} satisfies Record<DiagnosticLogLevel, typeof writeLogInfo>;

const getDiagnosticMessages = (level: DiagnosticLogLevel) =>
  vi.mocked(DIAGNOSTIC_LOG_WRITERS[level]).mock.calls.map(([message]) => message);

export const getDiagnosticMessageAt = (level: DiagnosticLogLevel, index: number) =>
  getDiagnosticMessages(level).at(index) ?? "";

export const getLastDiagnosticMessage = (level: DiagnosticLogLevel) =>
  getDiagnosticMessageAt(level, -1);

export const getDiagnosticPayloadAt = (level: DiagnosticLogLevel, index: number) =>
  JSON.parse(getDiagnosticMessageAt(level, index) || "{}") as DiagnosticPayload;

export const getLastDiagnosticPayload = (level: DiagnosticLogLevel) =>
  getDiagnosticPayloadAt(level, -1);

export const findDiagnosticPayload = (
  level: DiagnosticLogLevel,
  event: string,
  fields: DiagnosticPayload = {},
) =>
  getDiagnosticMessages(level)
    .map((message) => JSON.parse(message) as DiagnosticPayload)
    .find(
      (payload) =>
        payload.event === event &&
        Object.entries(fields).every(([key, value]) => payload[key] === value),
    );

// Diagnostics are written without being awaited, so tests that trigger them through a
// resolved operation still have to wait for the write to land.
export const pollForDiagnosticMessage = async (level: DiagnosticLogLevel, expected: string) => {
  await expect.poll(() => getLastDiagnosticMessage(level)).toContain(expected);
};
