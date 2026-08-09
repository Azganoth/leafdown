import { browser } from "@wdio/globals";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ARTIFACTS_DIR } from "./artifacts.js";

export interface DiagnosticsSummary {
  logFilePath: string;
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

export const waitForDiagnosticRecord = async (
  predicate: (record: DiagnosticRecord) => boolean,
  evidenceFileName: string,
) => {
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

  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(
    path.join(ARTIFACTS_DIR, evidenceFileName),
    `${JSON.stringify(result.record, null, 2)}\n`,
  );

  return result.record!;
};
