import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";

const require = createRequire(import.meta.url);
const root = resolve(process.argv[2] ?? process.cwd());
const pnpm = join(root, "node_modules", ".pnpm");
const babelDir = readdirSync(pnpm).find((name) => name.startsWith("@babel+parser@8"));
const { parse } = require(join(pnpm, babelDir, "node_modules", "@babel", "parser"));

const UI_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
  "label",
  "description",
]);
const UI_PROPERTIES = new Set([
  "title",
  "description",
  "label",
  "placeholder",
  "ariaLabel",
  "tooltip",
  "confirmLabel",
  "cancelLabel",
  "emptyLabel",
]);
const NON_UI_CALLEES =
  /^(console\.|invariant$|log\.|logger\.|writeDiagnostic|Error$|RangeError$|TypeError$|handleUnexpectedError$|invoke$|listen$|emit$|require$)/;
const PROSE = /^[A-Z][a-z']*(?:[ -][A-Za-z0-9.,…'’()/:-]+)*[.…!?:]?$|^[A-Z][a-z]+$/;

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "tests" || name === "test") continue;
      walk(path);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|\.d\.ts$/.test(name)) {
      files.push(path);
    }
  }
};
walk(join(root, "src"));

const area = (file) => {
  const rel = relative(join(root, "src"), file).split(sep).join("/");
  if (rel.startsWith("commands/")) return "commands";
  if (rel.startsWith("features/")) return `features/${rel.split("/")[1]}`;
  if (rel.startsWith("components/")) return `components/${rel.split("/")[1]}`;
  return rel.split("/")[0];
};

const calleeName = (node) => {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression")
    return `${calleeName(node.object)}.${node.property.name ?? ""}`;
  return "";
};

const findings = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const ast = parse(source, {
    sourceType: "module",
    plugins: file.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"],
  });
  const visit = (node, ancestors) => {
    if (!node || typeof node.type !== "string") return;
    const parent = ancestors.at(-1);
    const record = (text, kind) => {
      const trimmed = text.replace(/\s+/g, " ").trim();
      if (!/[A-Za-z]/.test(trimmed)) return;
      findings.push({
        file: relative(root, file).split(sep).join("/"),
        line: node.loc.start.line,
        area: area(file),
        kind,
        text: trimmed,
      });
    };
    const inNonUiCall = ancestors.some(
      (a) =>
        (a.type === "CallExpression" || a.type === "NewExpression") &&
        NON_UI_CALLEES.test(calleeName(a.callee)),
    );
    const inTypePosition = ancestors.some(
      (a) =>
        a.type?.startsWith("TS") &&
        !["TSSatisfiesExpression", "TSAsExpression", "TSNonNullExpression"].includes(a.type),
    );
    const isImport = ancestors.some(
      (a) =>
        a.type === "ImportDeclaration" ||
        a.type === "ExportAllDeclaration" ||
        (a.type === "ExportNamedDeclaration" && a.source),
    );
    if (node.type === "JSXText") {
      record(node.value, "jsx-text");
    } else if (node.type === "StringLiteral" && !isImport && !inTypePosition && !inNonUiCall) {
      if (parent?.type === "CallExpression" && calleeName(parent.callee) === "commandDef") {
        record(node.value, "command-label");
      } else if (parent?.type === "JSXAttribute") {
        if (UI_ATTRIBUTES.has(parent.name.name)) record(node.value, `attr:${parent.name.name}`);
      } else if (parent?.type === "ObjectProperty" && parent.value === node) {
        const key = parent.key.name ?? parent.key.value;
        if (UI_PROPERTIES.has(key)) record(node.value, `prop:${key}`);
        else if (/^[a-z]+(\.[A-Za-z0-9]+)+$/.test(key) && /^[A-Z]/.test(node.value)) {
          record(node.value, "command-label");
        } else if (
          PROSE.test(node.value) &&
          /^[A-Z][a-z]+$/.test(node.value) &&
          /^[a-z]+$/.test(key) &&
          key !== "key"
        ) {
          record(node.value, "prose-word");
        } else if (PROSE.test(node.value) && node.value.includes(" ")) record(node.value, "prose");
      } else if (
        !(parent?.type === "ObjectProperty" && parent.key === node) &&
        parent?.type !== "SwitchCase" &&
        !(parent?.type === "BinaryExpression" && /[=!]==/.test(parent.operator))
      ) {
        if (PROSE.test(node.value) && (node.value.includes(" ") || /[.…]$/.test(node.value))) {
          record(node.value, "prose");
        }
      }
    } else if (node.type === "TemplateLiteral" && !inNonUiCall && !inTypePosition) {
      const text = node.quasis.map((q) => q.value.cooked).join("{}");
      if (/[A-Za-z]{3,} [a-z]{2,}/.test(text)) record(text, "template");
    }
    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => visit(c, [...ancestors, node]));
      else if (child && typeof child.type === "string") visit(child, [...ancestors, node]);
    }
  };
  visit(ast.program, []);
}

if (process.argv.includes("--list")) {
  for (const f of findings) console.log(`${f.file}:${f.line}\t${f.kind}\t${f.text}`);
} else {
  const unique = new Set(findings.map((f) => f.text));
  console.log(`files scanned: ${files.length}`);
  console.log(`string occurrences: ${findings.length}, unique texts: ${unique.size}`);
  console.log(`template literals: ${findings.filter((f) => f.kind === "template").length}`);
  for (const [name, list] of Object.entries(Object.groupBy(findings, (f) => f.area)).sort()) {
    console.log(`${name.padEnd(28)} ${String(list.length).padStart(4)}`);
  }
}
