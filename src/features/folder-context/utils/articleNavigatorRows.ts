import { isSamePath, PathSet } from "@/lib/path";
import { findTreeNodeAncestors, flattenTree } from "@/lib/tree";

import type { ArticleTree, ArticleTreeNode } from "../services/folderContext";

interface ArticleNavigatorRowBase {
  depth: number;
  name: string;
  parentIndex: number | null;
  path: string;
  posInSet: number;
  setSize: number;
}

export interface ArticleNavigatorDirectoryRow extends ArticleNavigatorRowBase {
  kind: "directory";
  hasChildren: boolean;
  isExpanded: boolean;
}

export interface ArticleNavigatorArticleRow extends ArticleNavigatorRowBase {
  kind: "file";
  isActive: boolean;
}

export type ArticleNavigatorRow = ArticleNavigatorArticleRow | ArticleNavigatorDirectoryRow;

interface BuildArticleNavigatorRowsOptions {
  activeArticlePath: string | null;
  expandedDirectoryPaths: string[];
  tree: ArticleTree;
}

export const buildArticleNavigatorRows = ({
  activeArticlePath,
  expandedDirectoryPaths,
  tree,
}: BuildArticleNavigatorRowsOptions): ArticleNavigatorRow[] => {
  const expandedDirectoryPathSet = new PathSet(expandedDirectoryPaths);
  const entries = flattenTree({
    getChildren: getArticleTreeNodeChildren,
    roots: tree.children,
    shouldTraverseChildren: ({ node }) =>
      node.kind === "directory" && expandedDirectoryPathSet.has(node.path),
  });
  const positions = getTreePositions(entries.map(({ depth }) => depth));

  return entries.map(({ depth, node }, index): ArticleNavigatorRow => {
    const { parentIndex, posInSet, setSize } = positions[index];

    return node.kind === "file"
      ? {
          kind: "file",
          depth,
          isActive: activeArticlePath ? isSamePath(node.path, activeArticlePath) : false,
          name: node.name,
          parentIndex,
          path: node.path,
          posInSet,
          setSize,
        }
      : {
          kind: "directory",
          depth,
          hasChildren: node.children.length > 0,
          isExpanded: expandedDirectoryPathSet.has(node.path),
          name: node.name,
          parentIndex,
          path: node.path,
          posInSet,
          setSize,
        };
  });
};

export const getArticleDirectoryPaths = (tree: ArticleTree) =>
  flattenTree({
    getChildren: getArticleTreeNodeChildren,
    roots: tree.children,
  }).flatMap(({ node }) => (node.kind === "directory" ? [node.path] : []));

export const getArticleAncestorDirectoryPaths = (
  tree: ArticleTree,
  filePath: string,
): string[] | null =>
  findTreeNodeAncestors({
    getChildren: getArticleTreeNodeChildren,
    matches: (node) => node.kind === "file" && isSamePath(node.path, filePath),
    roots: tree.children,
  })?.flatMap((node) => (node.kind === "directory" ? [node.path] : [])) ?? null;

const getArticleTreeNodeChildren = (node: ArticleTreeNode) =>
  node.kind === "directory" ? node.children : [];

interface ArticleNavigatorRowTreePosition {
  parentIndex: number | null;
  posInSet: number;
  setSize: number;
}

const getTreePositions = (depths: number[]): ArticleNavigatorRowTreePosition[] => {
  const openAncestorIndexes: number[] = [];
  const parentIndexes = depths.map((depth, index) => {
    // Rows arrive depth first, so anything recorded deeper is a closed subtree.
    openAncestorIndexes.length = depth;
    openAncestorIndexes[depth] = index;

    return depth === 0 ? null : openAncestorIndexes[depth - 1];
  });

  const siblingCounts = new Map<number | null, number>();
  for (const parentIndex of parentIndexes) {
    siblingCounts.set(parentIndex, (siblingCounts.get(parentIndex) ?? 0) + 1);
  }

  const takenPositions = new Map<number | null, number>();

  return parentIndexes.map((parentIndex) => {
    const posInSet = (takenPositions.get(parentIndex) ?? 0) + 1;
    takenPositions.set(parentIndex, posInSet);

    return { parentIndex, posInSet, setSize: siblingCounts.get(parentIndex) ?? 0 };
  });
};
