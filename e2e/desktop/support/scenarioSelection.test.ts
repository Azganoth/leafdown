import assert from "node:assert/strict";
import test from "node:test";

import { selectScenarioNames } from "./scenarioSelection.js";

void test("runs every scenario when no focused target is requested", () => {
  assert.deepEqual(selectScenarioNames([]), [
    "diagnostics",
    "document-lifecycle",
    "folder-watcher",
    "rendered-images",
    "rendered-html",
    "missing-document-error",
    "persistence-write",
    "persistence-restart",
    "window-lifecycle",
  ]);
});

void test("selects one independent scenario", () => {
  assert.deepEqual(selectScenarioNames(["--scenario", "folder-watcher"]), ["folder-watcher"]);
});

void test("selects the persistence write and restart sequence together", () => {
  assert.deepEqual(selectScenarioNames(["--scenario", "persistence"]), [
    "persistence-write",
    "persistence-restart",
  ]);
});

void test("rejects missing, unknown, and malformed targets with the valid target list", () => {
  for (const args of [
    ["--scenario"],
    ["--scenario", "unknown"],
    ["--scenario=persistence"],
    ["folder-watcher"],
    ["--scenario", "folder-watcher", "extra"],
  ]) {
    assert.throws(
      () => selectScenarioNames(args),
      /Usage: pnpm test:e2e:desktop:run -- --scenario <name>[\s\S]*Valid scenarios:/u,
    );
  }
});
