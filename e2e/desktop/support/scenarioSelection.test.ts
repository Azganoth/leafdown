import assert from "node:assert/strict";
import test from "node:test";

import { MAX_DESKTOP_E2E_WORKERS, selectDesktopE2ERun } from "./scenarioSelection.js";

void test("runs every scenario when no focused target is requested", () => {
  assert.deepEqual(selectDesktopE2ERun([]), {
    scenarioGroups: [
      ["block-selection"],
      ["diagnostics"],
      ["document-lifecycle"],
      ["folder-watcher"],
      ["rendered-images"],
      ["remote-images"],
      ["rendered-html"],
      ["separator-presentation"],
      ["support-links"],
      ["missing-document-error"],
      ["persistence-write", "persistence-restart"],
      ["window-lifecycle"],
    ],
    workerCount: 1,
  });
});

void test("selects one independent scenario", () => {
  assert.deepEqual(selectDesktopE2ERun(["--scenario", "folder-watcher"]), {
    scenarioGroups: [["folder-watcher"]],
    workerCount: 1,
  });
});

void test("selects the persistence sequence and a bounded worker count in either order", () => {
  for (const args of [
    ["--scenario", "persistence", "--workers", "2"],
    ["--workers", "2", "--scenario", "persistence"],
    ["--", "--workers", "2", "--scenario", "persistence"],
  ]) {
    assert.deepEqual(selectDesktopE2ERun(args), {
      scenarioGroups: [["persistence-write", "persistence-restart"]],
      workerCount: 2,
    });
  }
});

void test("rejects missing, unknown, duplicate, and malformed options", () => {
  for (const args of [
    ["--scenario"],
    ["--scenario", "unknown"],
    ["--scenario=persistence"],
    ["folder-watcher"],
    ["--scenario", "folder-watcher", "extra"],
    ["--scenario", "folder-watcher", "--scenario", "diagnostics"],
    ["--workers", "2", "--workers", "3"],
    ["--workers", "0"],
    ["--workers", String(MAX_DESKTOP_E2E_WORKERS + 1)],
    ["--workers", "1.5"],
    ["--workers", "two"],
  ]) {
    assert.throws(
      () => selectDesktopE2ERun(args),
      /Usage: pnpm test:e2e:desktop:run -- \[--scenario <name>\] \[--workers <1-4>\][\s\S]*Valid scenarios:/u,
    );
  }
});
