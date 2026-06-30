import { isSamePath, PathSet } from "@/lib/path";
import { findTreeNodeAncestors, flattenTree } from "@/lib/tree";

import type { ArticleTree, ArticleTreeNode } from "../services/folderContext";

interface ArticleNavigatorRowBase {
  depth: number;
  name: string;
  path: string;
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

  return flattenTree({
    getChildren: getArticleTreeNodeChildren,
    roots: tree.children,
    shouldTraverseChildren: ({ node }) =>
      node.kind === "directory" && expandedDirectoryPathSet.has(node.path),
  }).map(
    ({ depth, node }): ArticleNavigatorRow =>
      node.kind === "file"
        ? {
            kind: "file",
            depth,
            isActive: activeArticlePath ? isSamePath(node.path, activeArticlePath) : false,
            name: node.name,
            path: node.path,
          }
        : {
            kind: "directory",
            depth,
            hasChildren: node.children.length > 0,
            isExpanded: expandedDirectoryPathSet.has(node.path),
            name: node.name,
            path: node.path,
          },
  );
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
