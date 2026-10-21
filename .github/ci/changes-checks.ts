import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyDiff,
  classifyEvent,
  documentationDelta,
  existingDocumentation,
  isDocumentationPath,
  parseDiff,
  readDiff,
  readPolicy,
} from "./changes.ts";

const policy = readPolicy();
const fixtures: string[] = [];
after(() => {
  for (const path of fixtures) {
    assert.equal(dirname(resolve(path)), resolve(tmpdir()));
    assert.ok(path.startsWith(join(tmpdir(), "ci-changes-test-")));
    rmSync(path, { recursive: true, force: true });
  }
});

function repository() {
  const cwd = mkdtempSync(join(tmpdir(), "ci-changes-test-"));
  fixtures.push(cwd);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--initial-branch=main");
  git("config", "user.email", "ci@example.invalid");
  git("config", "user.name", "Synthetic CI verification");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  git("config", "core.hooksPath", join(cwd, "no-hooks"));
  const write = (path: string, content = "# Synthetic documentation\n") => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  const commit = () => {
    git("add", "--all");
    git("commit", "--quiet", "-m", "Synthetic fixture");
    return git("rev-parse", "HEAD");
  };
  write("README.md");
  write("app.ts", "export const synthetic = 1;\n");
  const base = commit();
  return { cwd, git, write, commit, base };
}

await test("only approved prose takes the lightweight route", () => {
  for (const path of [
    "README.md",
    "CONTRIBUTING.md",
    "AGENTS.md",
    "docs/architecture.md",
    "docs/design/a guide – test.md",
  ]) {
    assert.equal(isDocumentationPath(path, policy), true, path);
  }
  for (const path of [
    "package.json",
    "pnpm-lock.yaml",
    ".github/workflows/ci.yml",
    ".github/ci/docs-only.json",
    "src/readme.md",
    "corpus/sample.md",
    "e2e/fixture.md",
    "app/ebook.mdx",
    "docs/probe.js",
    "docs/probe.html",
    "docs/image.svg",
    "../README.md",
    "/README.md",
    "docs/../README.md",
    "docs\\guide.md",
  ]) {
    assert.equal(isDocumentationPath(path, policy), false, path);
  }
  for (const prefix of policy.excludedDirectories) {
    assert.equal(isDocumentationPath(`${prefix}guide.md`, policy), false);
  }
  assert.equal(isDocumentationPath("CHANGELOG.md", policy), false);
});

await test("pull requests include code changes from earlier commits", () => {
  const repo = repository();
  repo.write("app.ts", "export const synthetic = 2;\n");
  const code = repo.commit();
  repo.write("README.md", "# Updated synthetic documentation\n");
  const head = repo.commit();
  assert.equal(
    classifyEvent(
      "pull_request",
      { pull_request: { base: { sha: repo.base }, head: { sha: head } } },
      { ...repo, policy },
    ).docsOnly,
    false,
  );
  assert.equal(
    classifyEvent("push", { before: code, after: head }, { ...repo, policy }).docsOnly,
    true,
  );
  assert.equal(
    classifyEvent("push", { before: repo.base, after: head }, { ...repo, policy }).docsOnly,
    false,
  );
});

await test("PR comparison uses the merge base, not unrelated newer base changes", () => {
  const repo = repository();
  repo.git("checkout", "-b", "synthetic-docs");
  repo.write("docs/guide.md");
  const head = repo.commit();
  repo.git("checkout", "main");
  repo.write("app.ts", "export const synthetic = 3;\n");
  const base = repo.commit();
  assert.equal(
    classifyEvent(
      "pull_request",
      { pull_request: { base: { sha: base }, head: { sha: head } } },
      { ...repo, policy },
    ).docsOnly,
    true,
  );
});

await test("renames inspect both paths and format only the surviving path", () => {
  const repo = repository();
  repo.write("docs/original.md");
  const base = repo.commit();
  renameSync(join(repo.cwd, "docs/original.md"), join(repo.cwd, "docs/renamed.md"));
  const head = repo.commit();
  assert.deepEqual(classifyDiff(readDiff(base, head, repo.cwd), policy), {
    docsOnly: true,
    files: ["docs/renamed.md"],
  });
  renameSync(join(repo.cwd, "app.ts"), join(repo.cwd, "docs/code.md"));
  const movedCode = repo.commit();
  assert.equal(classifyDiff(readDiff(head, movedCode, repo.cwd), policy).docsOnly, false);
  renameSync(join(repo.cwd, "docs/renamed.md"), join(repo.cwd, "runtime.md"));
  assert.equal(classifyDiff(readDiff(movedCode, repo.commit(), repo.cwd), policy).docsOnly, false);
});

await test("deletions need no formatting and empty diffs do not bypass checks", () => {
  const repo = repository();
  rmSync(join(repo.cwd, "README.md"));
  const head = repo.commit();
  assert.deepEqual(classifyDiff(readDiff(repo.base, head, repo.cwd), policy), {
    docsOnly: true,
    files: [],
  });
  assert.equal(classifyDiff([], policy).docsOnly, false);
  assert.deepEqual(existingDocumentation(["README.md"], policy, repo.cwd), []);
  assert.throws(() => existingDocumentation(["app.ts"], policy, repo.cwd));
});

await test("NUL-delimited paths preserve spaces, tabs, and line breaks", () => {
  const path = "docs/a guide\twith a line\nbreak.md";
  const entries = parseDiff(`:000000 100644 ${"0".repeat(40)} ${"a".repeat(40)} A\0${path}\0`);
  assert.deepEqual(classifyDiff(entries, policy).files, [path]);
});

await test("the classifier CLI writes routing outputs and a separate formatting list", () => {
  const repo = repository();
  repo.write("docs/a guide.md");
  const head = repo.commit();
  const eventPath = join(repo.cwd, "event.json");
  const outputPath = join(repo.cwd, "outputs.txt");
  const changedPath = join(repo.cwd, "changed.json");
  writeFileSync(eventPath, JSON.stringify({ before: repo.base, after: head }));
  execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./changes.ts", import.meta.url)), "classify"],
    {
      cwd: repo.cwd,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "push",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath,
        DOCS_CHANGED_FILE: changedPath,
      },
    },
  );
  assert.equal(readFileSync(outputPath, "utf8"), "docs-only=true\nformat-docs=true\n");
  const files: unknown = JSON.parse(readFileSync(changedPath, "utf8"));
  assert.deepEqual(files, ["docs/a guide.md"]);
});

await test("manual/new-branch events run the full pipeline; malformed comparisons fail", () => {
  assert.equal(classifyEvent("workflow_dispatch", {}).docsOnly, false);
  assert.equal(classifyEvent("push", { before: "0".repeat(40) }).docsOnly, false);
  assert.throws(() => classifyEvent("push", { before: "missing", after: "bad" }));
  const repo = repository();
  assert.throws(() => readDiff("f".repeat(40), repo.base, repo.cwd));
  assert.throws(() => parseDiff("malformed\0"));
  assert.throws(() =>
    parseDiff(":100644 100644 " + "a".repeat(40) + " " + "b".repeat(40) + " R100\0README.md\0"),
  );
});

await test("symlinks, executable prose, and type changes require full CI", () => {
  for (const entry of [
    { oldMode: "100644", newMode: "120000", status: "T", paths: ["README.md"] },
    { oldMode: "000000", newMode: "120000", status: "A", paths: ["docs/guide.md"] },
    { oldMode: "100644", newMode: "100755", status: "M", paths: ["README.md"] },
  ])
    assert.equal(classifyDiff([entry], policy).docsOnly, false);
});

await test("commit ranges allow descendant docs only and reject newer code or divergence", () => {
  const repo = repository();
  repo.write("README.md", "# Synthetic release documentation\n");
  const docs = repo.commit();
  assert.equal(documentationDelta(repo.base, repo.base, repo), true);
  assert.equal(documentationDelta(repo.base, docs, repo), true);
  repo.write("app.ts", "export const synthetic = 4;\n");
  const code = repo.commit();
  assert.equal(documentationDelta(repo.base, code, repo), false);
  assert.equal(documentationDelta(code, docs, repo), false);
  repo.write("app.ts", "export const synthetic = 1;\n");
  const reverted = repo.commit();
  assert.equal(
    classifyEvent("push", { before: repo.base, after: reverted }, { ...repo, policy }).docsOnly,
    false,
  );
  repo.git("checkout", "-b", "synthetic-divergent", repo.base);
  repo.write("docs/divergent.md");
  assert.equal(documentationDelta(docs, repo.commit(), repo), false);
});
