import assert from "node:assert/strict";
import { test } from "node:test";

import { gateResults } from "./gate.ts";

type TestJob = { result: string; outputs?: Record<string, string> };
type GateCase = { skipPreview?: boolean; skipE2e?: boolean };

const required = ["check", "e2e", "preview", "preview-verify"];
const ids = ["changes", "lint-workflows", ...required];
const statuses = ["success", "failure", "cancelled", "skipped"];

for (const docsOnly of [false, true]) {
  for (const options of [
    {},
    { skipPreview: true },
    { skipPreview: true, skipE2e: true },
  ] as GateCase[]) {
    await test(`gate result combinations: docs=${docsOnly}, policy=${JSON.stringify(options)}`, () => {
      for (let encoded = 0; encoded < statuses.length ** ids.length; encoded++) {
        let remaining = encoded;
        const jobs: Record<string, TestJob> = Object.fromEntries(
          ids.map((id) => {
            const result = statuses[remaining % statuses.length];
            remaining = Math.floor(remaining / statuses.length);
            return [id, { result }] as const;
          }),
        );
        jobs.changes.outputs = { "docs-only": String(docsOnly) };
        const expected = Object.fromEntries(
          ids.map((id): readonly [string, string] => [
            id,
            id === "changes" || id === "lint-workflows"
              ? "success"
              : docsOnly ||
                  (id === "e2e" && options.skipE2e) ||
                  (["preview", "preview-verify"].includes(id) && options.skipPreview)
                ? "skipped"
                : "success",
          ]),
        );
        assert.equal(
          gateResults(jobs, required, options).every((row) => row.result === row.expected),
          ids.every((id) => jobs[id].result === expected[id]),
        );
      }
    });
  }
}

await test("missing prerequisites and missing/invalid classifier outputs fail closed", () => {
  const jobs: Record<string, TestJob> = Object.fromEntries(
    ids.map((id) => [id, { result: "success" }] as const),
  );
  assert.throws(() => gateResults({}, required));
  assert.throws(() => gateResults(jobs, required));
  jobs.changes.outputs = { "docs-only": "yes" };
  assert.throws(() => gateResults(jobs, required));
  jobs.changes.outputs["docs-only"] = "false";
  assert.throws(() => gateResults({ ...jobs, unexpected: { result: "success" } }, required));
  delete jobs.check;
  assert.throws(() => gateResults(jobs, required));
});
