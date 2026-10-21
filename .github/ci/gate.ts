import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type GateOptions = { skipE2e?: boolean; skipPreview?: boolean };
type JobResult = { result: string; outputs?: Record<string, unknown> };

function record(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new Error("Expected prerequisite results.");
  return input;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

function jobResult(input: unknown): JobResult {
  const job = record(input);
  if (
    typeof job.result !== "string" ||
    !["success", "failure", "cancelled", "skipped"].includes(job.result)
  )
    throw new Error("Invalid prerequisite result.");
  return {
    result: job.result,
    outputs: job.outputs === undefined ? undefined : record(job.outputs),
  };
}

export function gateResults(
  input: unknown,
  required: string[],
  { skipE2e = false, skipPreview = false }: GateOptions = {},
) {
  const ids = ["changes", "lint-workflows", ...required];
  const values = record(input);
  if (
    required.length === 0 ||
    new Set(ids).size !== ids.length ||
    JSON.stringify(Object.keys(values).toSorted()) !== JSON.stringify(ids.toSorted())
  )
    throw new Error("The gate requires the complete, configured prerequisite results.");
  const jobs = Object.fromEntries(
    Object.entries(values).map(([id, value]) => [id, jobResult(value)] as const),
  );
  const docsOnly = jobs.changes.outputs?.["docs-only"];
  if (docsOnly !== "true" && docsOnly !== "false")
    throw new Error("A valid documentation classification is required.");
  const skipped = new Set(docsOnly === "true" ? required : []);
  if (skipE2e) skipped.add("e2e");
  if (skipPreview) {
    skipped.add("preview");
    skipped.add("preview-verify");
  }
  return ids.map((id) => ({
    id,
    result: jobs[id].result,
    expected: skipped.has(id) && required.includes(id) ? "skipped" : "success",
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = gateResults(
    JSON.parse(process.env.NEEDS_RESULTS ?? "null"),
    process.argv.slice(2),
    { skipE2e: process.env.SKIP_E2E === "true", skipPreview: process.env.SKIP_PREVIEW === "true" },
  );
  for (const { id, result, expected } of results)
    console.log(`${id}: ${result} (expected ${expected})`);
  process.exitCode = results.some(({ result, expected }) => result !== expected) ? 1 : 0;
}
