import assert from "node:assert/strict";
import test from "node:test";

import { runWorkerPool } from "./workerPool.js";

void test("bounds overlapping groups by the requested worker count", async () => {
  let activeGroups = 0;
  let maximumActiveGroups = 0;

  const failures = await runWorkerPool({
    groups: ["first", "second", "third", "fourth"],
    runGroup: async () => {
      activeGroups += 1;
      maximumActiveGroups = Math.max(maximumActiveGroups, activeGroups);
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });
      activeGroups -= 1;
    },
    workerCount: 2,
  });

  assert.deepEqual(failures, []);
  assert.equal(maximumActiveGroups, 2);
});

void test("keeps every scenario in a logical group on one worker in order", async () => {
  const observed: Array<{ group: string[]; workerIndex: number }> = [];

  await runWorkerPool({
    groups: [["persistence-write", "persistence-restart"], ["diagnostics"]],
    runGroup: async (group, workerIndex) => {
      observed.push({ group, workerIndex });
    },
    workerCount: 2,
  });

  assert.equal(observed.length, 2);
  assert.deepEqual(observed[0], {
    group: ["persistence-write", "persistence-restart"],
    workerIndex: 0,
  });
  assert.deepEqual(observed[1], { group: ["diagnostics"], workerIndex: 1 });
});

void test("lets healthy workers finish queued groups after another worker fails", async () => {
  const completed: string[] = [];

  const failures = await runWorkerPool({
    groups: ["fails", "slow", "after-failure"],
    runGroup: async (group) => {
      if (group === "fails") {
        throw new Error("expected failure");
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
      completed.push(group);
    },
    workerCount: 2,
  });

  assert.deepEqual(completed, ["slow", "after-failure"]);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.group, "fails");
  assert.equal(failures[0]?.workerIndex, 0);
  assert.match(String(failures[0]?.error), /expected failure/u);
});
