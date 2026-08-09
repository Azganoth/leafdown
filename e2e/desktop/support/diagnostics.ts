import { browser } from "@wdio/globals";
import { readFile } from "node:fs/promises";

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

export interface DiagnosticRecord {
  errorKind?: string;
  event?: string;
  feature?: string;
  operation?: string;
  path?: string;
  phase?: string;
  runId?: string;
  [key: string]: unknown;
}

export const getDiagnosticsSummary = () =>
  browser.tauri.execute(
    ({ core }) => core.invoke("get_diagnostics_summary") as Promise<DiagnosticsSummary>,
  );

export const readRunDiagnostics = async ({ logFilePath, runId }: DiagnosticsSummary) => {
  const contents = await readFile(logFilePath, "utf8");

  return contents
    .split(/\r?\n/u)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as DiagnosticRecord];
      } catch {
        return [];
      }
    })
    .filter((record) => record.runId === runId);
};

export const waitForDiagnosticRecord = async (predicate: (record: DiagnosticRecord) => boolean) => {
  const summary = await getDiagnosticsSummary();
  const result: { record?: DiagnosticRecord } = {};

  await browser.waitUntil(
    async () => {
      const records = await readRunDiagnostics(summary);
      result.record = records.find(predicate);
      return Boolean(result.record);
    },
    { timeoutMsg: "Expected structured application diagnostic did not appear." },
  );

  return result.record!;
};
