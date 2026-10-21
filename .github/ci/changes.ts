import { spawnSync } from "node:child_process";
import { appendFileSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Policy = { files: string[]; markdownDirectories: string[]; excludedDirectories: string[] };
type DiffEntry = { oldMode: string; newMode: string; status: string; paths: string[] };
type Classification = { docsOnly: boolean; files: string[] };
type Options = { cwd?: string; policy?: Policy };

function record(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new Error("Expected an object.");
  }
  return input;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input);
}

function strings(input: unknown): string[] {
  if (!Array.isArray(input) || !input.every((value: unknown) => typeof value === "string")) {
    throw new Error("Expected a list of strings.");
  }
  return input;
}

function environment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

export function readPolicy(): Policy {
  const input = record(
    JSON.parse(readFileSync(new URL("./docs-only.json", import.meta.url), "utf8")),
  );
  const policy = {
    files: strings(input.files),
    markdownDirectories: strings(input.markdownDirectories),
    excludedDirectories: strings(input.excludedDirectories),
  };
  for (const directory of [...policy.markdownDirectories, ...policy.excludedDirectories]) {
    if (!directory.endsWith("/") || directory.startsWith("/") || directory.includes("..")) {
      throw new Error(
        "Documentation directories must be repository-relative prefixes ending in /.",
      );
    }
  }
  return policy;
}

export function isDocumentationPath(path: unknown, policy: Policy): path is string {
  if (
    typeof path !== "string" ||
    path.includes("\\") ||
    path.split("/").some((part) => ["", ".", ".."].includes(part))
  )
    return false;
  if (policy.excludedDirectories.some((directory) => path.startsWith(directory))) return false;
  return (
    policy.files.includes(path) ||
    (path.endsWith(".md") &&
      policy.markdownDirectories.some((directory) => path.startsWith(directory)))
  );
}

function git(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function commitSha(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/u.test(value) || /^0+$/u.test(value)) {
    throw new Error("Expected a nonzero commit SHA.");
  }
  return value;
}

export function parseDiff(raw: string): DiffEntry[] {
  if (raw === "") return [];
  const fields = raw.split("\0");
  if (fields.pop() !== "") throw new Error("Unterminated git diff output.");
  const entries: DiffEntry[] = [];
  for (let index = 0; index < fields.length;) {
    const match = /^:([0-7]{6}) ([0-7]{6}) [a-f0-9]{40} [a-f0-9]{40} ([A-Z])\d*$/u.exec(
      fields[index++],
    );
    if (!match || !"ACDMRTUXB".includes(match[3])) throw new Error("Malformed git diff entry.");
    const paths = [fields[index++]];
    if (["R", "C"].includes(match[3])) paths.push(fields[index++]);
    if (paths.some((path) => typeof path !== "string" || path.length === 0))
      throw new Error("Missing git diff path.");
    entries.push({ oldMode: match[1], newMode: match[2], status: match[3], paths });
  }
  return entries;
}

export function readDiff(base: string, head: string, cwd = process.cwd()): DiffEntry[] {
  return parseDiff(
    git(
      [
        "diff",
        "--raw",
        "-z",
        "--no-abbrev",
        "--find-renames",
        commitSha(base),
        commitSha(head),
        "--",
      ],
      cwd,
    ),
  );
}

export function classifyDiff(entries: DiffEntry[], policy: Policy): Classification {
  const docsOnly =
    entries.length > 0 &&
    entries.every(
      (entry) =>
        ["A", "C", "D", "M", "R"].includes(entry.status) &&
        [entry.oldMode, entry.newMode].every((mode) => ["000000", "100644"].includes(mode)) &&
        entry.paths.length > 0 &&
        entry.paths.every((path) => isDocumentationPath(path, policy)),
    );
  return {
    docsOnly,
    files: docsOnly
      ? [
          ...new Set(
            entries
              .filter((entry) => entry.newMode !== "000000")
              .map((entry) => entry.paths[entry.paths.length - 1]),
          ),
        ].toSorted()
      : [],
  };
}

export function documentationDelta(
  base: string,
  head: string,
  { cwd = process.cwd(), policy = readPolicy() }: Options = {},
): boolean {
  commitSha(base);
  commitSha(head);
  if (base === head) return true;
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", base, head], { cwd });
  if (ancestor.error) throw ancestor.error;
  if (ancestor.status === 1) return false;
  if (ancestor.status !== 0) throw new Error("Could not establish candidate ancestry.");
  const commits = git(["rev-list", "--first-parent", "--parents", head], cwd).trim().split("\n");
  for (const line of commits) {
    const [sha, parent] = line.split(" ");
    if (sha === base) return true;
    if (!parent || !classifyDiff(readDiff(parent, sha, cwd), policy).docsOnly) return false;
  }
  return false;
}

export function classifyEvent(
  eventName: string,
  event: unknown,
  { cwd = process.cwd(), policy = readPolicy() }: Options = {},
): Classification {
  if (eventName === "pull_request") {
    const pull = record(record(event).pull_request);
    const head = commitSha(record(pull.head).sha);
    const base = git(["merge-base", commitSha(record(pull.base).sha), head], cwd).trim();
    return classifyDiff(readDiff(base, head, cwd), policy);
  }
  if (eventName === "push") {
    const push = record(event);
    if ((typeof push.before === "string" && /^0{40}$/u.test(push.before)) || push.deleted === true)
      return { docsOnly: false, files: [] };
    const base = commitSha(push.before);
    const head = commitSha(push.after);
    if (!documentationDelta(base, head, { cwd, policy })) return { docsOnly: false, files: [] };
    return classifyDiff(readDiff(base, head, cwd), policy);
  }
  return { docsOnly: false, files: [] };
}

export function existingDocumentation(
  input: unknown,
  policy: Policy,
  cwd = process.cwd(),
): string[] {
  const files = strings(input);
  if (!files.every((path) => isDocumentationPath(path, policy)))
    throw new Error("Invalid documentation formatting paths.");
  return files.filter((path) => {
    try {
      const stat = lstatSync(resolve(cwd, path));
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error("Expected a regular documentation file.");
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === "classify") {
    const result = classifyEvent(
      environment("GITHUB_EVENT_NAME"),
      JSON.parse(readFileSync(environment("GITHUB_EVENT_PATH"), "utf8")),
    );
    writeFileSync(environment("DOCS_CHANGED_FILE"), JSON.stringify(result.files));
    appendFileSync(
      environment("GITHUB_OUTPUT"),
      `docs-only=${result.docsOnly}\nformat-docs=${result.files.length > 0}\n`,
    );
    console.log(result.docsOnly ? "Maintenance documentation only." : "Full validation required.");
  } else if (command === "format") {
    const files = existingDocumentation(
      JSON.parse(readFileSync(environment("DOCS_CHANGED_FILE"), "utf8")),
      readPolicy(),
    );
    if (files.length > 0) {
      const result = spawnSync(
        "pnpm",
        ["exec", "oxfmt", "--check", "--no-error-on-unmatched-pattern", "--", ...files],
        { stdio: "inherit" },
      );
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } else throw new Error("Expected classify or format.");
}
