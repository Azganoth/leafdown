/* oxlint-disable -- untyped Node measurement scripts kept as spike evidence; see README.md */
// Prints Markdown tables from the probe outputs in a results directory (default ./results).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RESULTS = process.argv[2] ?? fileURLToPath(new URL("./results/", import.meta.url));

const read = (file) =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
const ORDER = ["flat", "shallow", "deep"].flatMap((shape) =>
  ["1000", "10000", "50000"].map((size) => `${shape}-${size}`),
);
const bySize = (a, b) =>
  Number(a.split("-")[1]) - Number(b.split("-")[1]) || ORDER.indexOf(a) - ORDER.indexOf(b);
const fixtures = [...ORDER].sort(bySize);
const table = (headers, rows) =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
const mb = (bytes) => (bytes / 1048576).toFixed(1);

const longScan = read(`${RESULTS}/scan-long-root.jsonl`);
const shortScan = read(`${RESULTS}/scan.jsonl`);
const fns = read(`${RESULTS}/navigator-functions.jsonl`);
const app = read(`${RESULTS}/app.jsonl`);
const pick = (list, fixture, op, extra = {}) =>
  list.find(
    (record) =>
      record.fixture === fixture &&
      record.op === op &&
      Object.entries(extra).every(([key, value]) => record[key] === value),
  );

console.log("### Backend scan (release, warm cache)\n");
console.log(
  table(
    [
      "Fixture",
      "Entries visited",
      "Directories in tree",
      "Walk ms",
      "Scan name ms",
      "Scan modified ms",
      "Scan type ms",
      "JSON MB (short / long root)",
    ],
    fixtures.map((fixture) => {
      const walk = pick(shortScan, fixture, "walk");
      const name = pick(shortScan, fixture, "scan", { sort: "name" });
      const longName = pick(longScan, fixture, "scan", { sort: "name" });
      const modified = pick(longScan, fixture, "scan", { sort: "modifiedDate" });
      const type = pick(longScan, fixture, "scan", { sort: "type" });
      return [
        fixture,
        walk.entries,
        name.dirs,
        walk.medianMs.toFixed(0),
        `${name.medianMs.toFixed(0)} (long root ${longName.minMs.toFixed(0)}–${longName.maxMs.toFixed(0)})`,
        `${modified.minMs.toFixed(0)}–${modified.maxMs.toFixed(0)}`,
        type.medianMs.toFixed(0),
        `${mb(name.jsonBytes)} / ${mb(longName.jsonBytes)}`,
      ];
    }),
  ),
);

console.log("\n### Navigator functions (Node V8, median of 7)\n");
console.log(
  table(
    [
      "Fixture",
      "Parse",
      "File count",
      "Ancestors of last file",
      "Rows collapsed (n)",
      "Rows all expanded (n)",
      "Focused index, last row",
      "Filter `e`",
      "Filter `meeting`",
      "Toggle with all dirs expanded",
    ],
    fixtures.map((fixture) => {
      const record = fns.find((entry) => entry.fixture === fixture);
      return [
        fixture,
        record.parseMs,
        record.fileCountMs,
        record.ancestorsOfLastFileMs,
        `${record.rowsCollapsedMs} (${record.collapsedRows})`,
        `${record.rowsAllExpandedMs} (${record.expandedRows})`,
        record.focusedIndexLastRowMs,
        record.filterBroadMs,
        record.filterWordMs,
        record.toggleWithAllExpandedMs,
      ];
    }),
  ),
);

console.log("\n### Open folder in the release app (ms)\n");
console.log(
  table(
    [
      "Fixture",
      "Click → usable",
      "IPC request → response",
      "Body + JSON.parse",
      "Parsed → rendered",
      "Rendered → frame",
      "Click → watcher ready",
      "Longest task",
      "Heap peak / after GC MB",
      "Renderer WS MB",
      "Host peak MB",
    ],
    fixtures.map((fixture) => {
      const record = pick(app, fixture, "open");
      if (!record) return [fixture, "—"];
      return [
        fixture,
        record.clickToUsableMs,
        record.ipcToHeadersMs,
        record.bodyParseMs,
        record.parsedToRenderedMs,
        record.renderedToFrameMs,
        record.clickToWatchReadyMs,
        record.blocking.maxMs,
        `${record.heapPeakMB} / ${record.heapAfterGcMB}`,
        record.rendererWorkingSetMB,
        record.hostPeakMB,
      ];
    }),
  ),
);

console.log("\n### Navigator interactions in the release app (ms, click or key → next frame)\n");
console.log(
  table(
    [
      "Fixture",
      "Expand one",
      "Collapse one",
      "Expand all",
      "Toggle one with all expanded",
      "Collapse all",
      "Filter keystrokes m,e,e,t,i,n,g",
      "Clear filter",
    ],
    fixtures.map((fixture) => {
      const expand = app.filter(
        (record) => record.fixture === fixture && record.op === "expandCollapse",
      );
      const first = expand.find((record) => !record.allExpanded);
      const all = expand.find((record) => record.allExpanded);
      const expandAll = pick(app, fixture, "expandAll");
      const collapseAll = pick(app, fixture, "collapseAll");
      const filter = pick(app, fixture, "filter");
      return [
        fixture,
        first?.expand?.ms ?? "—",
        first?.collapse?.ms ?? "—",
        expandAll?.ms ?? "—",
        all ? `${all.collapse.ms} / ${all.expand.ms}` : "—",
        collapseAll?.ms ?? "—",
        filter ? filter.keystrokes.map((stroke) => stroke.ms).join(", ") : "—",
        filter?.clear.ms ?? "—",
      ];
    }),
  ),
);

console.log("\n### Sort order change in the release app (click → next frame, ms)\n");
console.log(
  table(
    ["Fixture", "Modified date", "Type", "Name", "Longest task"],
    fixtures.map((fixture) => {
      const records = ["modifiedDate", "type", "name"].map((mode) =>
        pick(app, fixture, `sort:${mode}`),
      );
      return [
        fixture,
        ...records.map((record) => (record ? `${record.ms} (IPC ${record.ipcToHeadersMs})` : "—")),
        Math.max(...records.map((record) => record?.blocking.maxMs ?? 0)),
      ];
    }),
  ),
);

console.log("\n### Watcher in the release app\n");
console.log(
  table(
    [
      "Fixture",
      "Create ms",
      "Rename ms",
      "Delete ms",
      "1,000 .md: last write → visible ms",
      "events / scans",
      "Delete that directory ms",
      "1,000 .txt: events / scans",
    ],
    fixtures.map((fixture) => {
      const create = pick(app, fixture, "watch:create");
      const rename = pick(app, fixture, "watch:rename");
      const remove = pick(app, fixture, "watch:delete");
      const burst = pick(app, fixture, "watch:burst1000");
      const deleteDir = pick(app, fixture, "watch:deleteDir1000");
      const txt = pick(app, fixture, "watch:burst1000.txt");
      return [
        fixture,
        create?.ms ?? "—",
        rename?.ms ?? "—",
        remove?.ms ?? "—",
        burst ? `${burst.fromLastWriteMs} (write ${burst.writeMs})` : "—",
        burst ? `${burst.events} / ${burst.scans}` : "—",
        deleteDir?.fromDeleteMs ?? "—",
        txt ? `${txt.events} / ${txt.scans}` : "—",
      ];
    }),
  ),
);

console.log("\n### Other app records\n");
for (const record of app.filter(
  (entry) =>
    ["launch", "idle", "rapidSwitch", "reopen", "error", "openArticleFromNavigator"].includes(
      entry.op,
    ) ||
    entry.op.startsWith("keys") ||
    entry.op === "watch:burst10000" ||
    entry.op === "watch:deleteDir10000",
)) {
  console.log(`- ${JSON.stringify(record)}`);
}
