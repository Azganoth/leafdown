/* oxlint-disable -- untyped Node measurement scripts kept as spike evidence; see README.md */
// Deterministic fixture generator for the large-folder measurements. See README.md.
// Usage: node gen-fixtures.mjs <outRoot> [sizes=1000,10000,50000] [shapes=flat,shallow,deep]
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const outRoot = process.argv[2];
if (!outRoot) throw new Error("outRoot required");
const sizes = (process.argv[3] ?? "1000,10000,50000").split(",").map(Number);
const shapes = (process.argv[4] ?? "flat,shallow,deep").split(",");

let seed = 540;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const WORDS = [
  "alpha",
  "meeting",
  "draft",
  "journal",
  "research",
  "zettel",
  "idea",
  "todo",
  "review",
  "design",
  "notes",
  "summary",
  "plan",
  "retro",
  "spec",
  "outline",
  "reading",
  "log",
];
const pick = (list) => list[Math.floor(rand() * list.length)];
const UNSUPPORTED = [".txt", ".png", ".json", ".pdf", ".csv"];

const stats = { markdown: 0, unsupported: 0, ignored: 0, directories: 0, emptyDirectories: 0 };
const mkdir = (dir) => {
  mkdirSync(dir, { recursive: true });
  stats.directories += 1;
};
const touch = (file, content = "") => writeFileSync(file, content);

const writeMarkdown = (dir, count, prefix) => {
  for (let i = 0; i < count; i += 1) {
    const ext = rand() < 0.05 ? ".markdown" : ".md";
    touch(path.join(dir, `${pick(WORDS)}-${prefix}-${i}${ext}`), `# ${prefix} ${i}\n`);
    stats.markdown += 1;
  }
};
const writeUnsupported = (dir, count, prefix) => {
  for (let i = 0; i < count; i += 1) {
    touch(path.join(dir, `asset-${prefix}-${i}${pick(UNSUPPORTED)}`));
    stats.unsupported += 1;
  }
};
const writeIgnoredTree = (dir, name, fileCount) => {
  const root = path.join(dir, name);
  const perDir = 50;
  for (let d = 0; d < Math.ceil(fileCount / perDir); d += 1) {
    const sub = path.join(root, `pkg-${d}`, "lib");
    mkdirSync(sub, { recursive: true });
    for (let i = 0; i < perDir; i += 1) {
      touch(path.join(sub, `file-${i}${i % 5 === 0 ? ".md" : ".js"}`));
      stats.ignored += 1;
    }
  }
};

const addExtras = (root, markdownCount) => {
  // Ignored subtrees sized with the fixture, so skipping them is measured at scale.
  writeIgnoredTree(root, "node_modules", Math.max(500, markdownCount / 10));
  writeIgnoredTree(root, ".git", Math.max(200, markdownCount / 25));
  for (let i = 0; i < 10; i += 1) {
    mkdir(path.join(root, `empty-${i}`));
    stats.emptyDirectories += 1;
  }
  for (let i = 0; i < 5; i += 1) {
    const dir = path.join(root, `assets-only-${i}`);
    mkdir(dir);
    writeUnsupported(dir, 20, `ao${i}`);
  }
  // One 30-level chain to exercise deep recursion and indentation.
  let chain = root;
  for (let i = 0; i < 30; i += 1) {
    chain = path.join(chain, `level-${i}`);
    mkdir(chain);
  }
  writeMarkdown(chain, 1, "deepest");
};

const generate = (shape, markdownTarget) => {
  const root = path.join(outRoot, `${shape}-${markdownTarget}`);
  if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const key of Object.keys(stats)) stats[key] = 0;
  const startedAt = performance.now();
  const body = markdownTarget - 1;

  if (shape === "flat") {
    writeMarkdown(root, body, "f");
    writeUnsupported(root, body, "f");
  } else if (shape === "shallow") {
    const perDir = 100;
    for (let d = 0; d < Math.ceil(body / perDir); d += 1) {
      const dir = path.join(root, `${pick(WORDS)}-folder-${d}`);
      mkdir(dir);
      const count = Math.min(perDir, body - d * perDir);
      writeMarkdown(dir, count, `s${d}`);
      writeUnsupported(dir, count, `s${d}`);
    }
  } else if (shape === "deep") {
    // Breadth-first, branching 3, five articles per directory, until the target is met.
    const perDir = 5;
    const queue = [root];
    let remaining = body;
    let index = 0;
    while (remaining > 0) {
      const parent = queue.shift();
      for (let b = 0; b < 3 && remaining > 0; b += 1) {
        const dir = path.join(parent, `${pick(WORDS)}-${index}`);
        index += 1;
        mkdir(dir);
        const count = Math.min(perDir, remaining);
        writeMarkdown(dir, count, `d${index}`);
        writeUnsupported(dir, count, `d${index}`);
        remaining -= count;
        queue.push(dir);
      }
    }
  } else {
    throw new Error(`unknown shape ${shape}`);
  }

  addExtras(root, markdownTarget);
  const elapsedMs = Math.round(performance.now() - startedAt);
  console.log(JSON.stringify({ fixture: path.basename(root), ...stats, elapsedMs }));
};

for (const size of sizes) {
  for (const shape of shapes) {
    generate(shape, size);
  }
}
