import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";

import type { ArticleTree, ArticleTreeNode } from "./services/folderContext";
import { useArticleNavigatorStore } from "./stores/articleNavigator";
import {
  buildArticleNavigatorRows,
  filterArticleTreeByArticleName,
  getArticleAncestorDirectoryPaths,
  getArticleDirectoryPaths,
  getArticleFileCount,
} from "./utils/articleNavigatorRows";
import { getArticleNavigatorFocusedIndex } from "./utils/articleNavigatorTraversal";

const TREES = process.env.PERF_TREES;
const OUT = process.env.PERF_OUT ?? "navigator-functions.jsonl";

const median = (fn: () => unknown, runs = 7) => {
  fn();
  const samples: number[] = [];
  for (let index = 0; index < runs; index += 1) {
    const startedAt = performance.now();
    fn();
    samples.push(performance.now() - startedAt);
  }
  return Number(samples.toSorted((left, right) => left - right)[Math.floor(runs / 2)].toFixed(2));
};

const lastFilePath = (nodes: ArticleTreeNode[]): string | null => {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node.kind === "file") return node.path;
    const nested = lastFilePath(node.children);
    if (nested) return nested;
  }
  return null;
};

it.skipIf(!TREES)(
  "perf probe navigator functions",
  () => {
    const lines: string[] = [];

    for (const file of readdirSync(TREES!).toSorted()) {
      const text = readFileSync(`${TREES}/${file}`, "utf8");
      const parseMs = median(() => JSON.parse(text));
      const tree = (JSON.parse(text) as { tree: ArticleTree }).tree;
      const directoryPaths = getArticleDirectoryPaths(tree);
      const activePath = lastFilePath(tree.children);
      const collapsedRows = buildArticleNavigatorRows({
        activeArticlePath: activePath,
        expandedDirectoryPaths: [],
        tree,
      });
      const expandedRows = buildArticleNavigatorRows({
        activeArticlePath: activePath,
        expandedDirectoryPaths: directoryPaths,
        tree,
      });

      const filter = (query: string) => {
        const filtered = filterArticleTreeByArticleName(tree, query);
        return buildArticleNavigatorRows({
          activeArticlePath: activePath,
          expandedDirectoryPaths: getArticleDirectoryPaths(filtered),
          tree: filtered,
        }).length;
      };

      const store = useArticleNavigatorStore.getState();
      store.reset();
      const expandAllMs = median(() => {
        useArticleNavigatorStore.getState().reset();
        useArticleNavigatorStore.getState().expandDirectories(directoryPaths);
      });
      const lastDirectory = directoryPaths.at(-1) ?? tree.path;
      const toggleWithAllExpandedMs = median(() => {
        useArticleNavigatorStore.getState().toggleDirectory(lastDirectory);
      });
      store.reset();

      lines.push(
        JSON.stringify({
          fixture: file.replace(".json", ""),
          jsonBytes: text.length,
          directories: directoryPaths.length,
          collapsedRows: collapsedRows.length,
          expandedRows: expandedRows.length,
          parseMs,
          fileCountMs: median(() => getArticleFileCount(tree)),
          directoryPathsMs: median(() => getArticleDirectoryPaths(tree)),
          ancestorsOfLastFileMs: median(() => getArticleAncestorDirectoryPaths(tree, activePath!)),
          rowsCollapsedMs: median(() =>
            buildArticleNavigatorRows({
              activeArticlePath: activePath,
              expandedDirectoryPaths: [],
              tree,
            }),
          ),
          rowsAllExpandedMs: median(() =>
            buildArticleNavigatorRows({
              activeArticlePath: activePath,
              expandedDirectoryPaths: directoryPaths,
              tree,
            }),
          ),
          focusedIndexLastRowMs: median(() =>
            getArticleNavigatorFocusedIndex(expandedRows, expandedRows.at(-1)!.path),
          ),
          filterBroadMs: median(() => filter("e")),
          filterBroadRows: filter("e"),
          filterWordMs: median(() => filter("meeting")),
          filterWordRows: filter("meeting"),
          filterNoneMs: median(() => filter("zzzz")),
          expandAllMs,
          toggleWithAllExpandedMs,
        }),
      );
    }

    expect(lines.length).toBeGreaterThan(0);
    writeFileSync(OUT, `${lines.join("\n")}\n`);
  },
  600_000,
);
