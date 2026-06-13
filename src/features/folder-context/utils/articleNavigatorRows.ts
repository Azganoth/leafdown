import type { ArticleTree, ArticleTreeNode } from "../types";

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

export interface BuildArticleNavigatorRowsOptions {
  activeArticlePath: string | null;
  expandedDirectoryPaths: string[];
  tree: ArticleTree;
}

export const buildArticleNavigatorRows = ({
  activeArticlePath,
  expandedDirectoryPaths,
  tree,
}: BuildArticleNavigatorRowsOptions): ArticleNavigatorRow[] => {
  const expandedDirectoryPathSet = new Set(expandedDirectoryPaths);
  const rows: ArticleNavigatorRow[] = [];

  appendVisibleRows({
    activeArticlePath,
    depth: 0,
    expandedDirectoryPathSet,
    nodes: tree.children,
    rows,
  });

  return rows;
};

export const getArticleDirectoryPaths = (tree: ArticleTree) => {
  const paths: string[] = [];

  appendDirectoryPaths(tree.children, paths);

  return paths;
};

export const getArticleAncestorDirectoryPaths = (
  tree: ArticleTree,
  filePath: string,
): string[] | null => findFileAncestorDirectoryPaths(tree.children, filePath, []);

export const treeHasArticlePath = (tree: ArticleTree, filePath: string) =>
  getArticleAncestorDirectoryPaths(tree, filePath) !== null;

interface AppendVisibleRowsOptions {
  activeArticlePath: string | null;
  depth: number;
  expandedDirectoryPathSet: Set<string>;
  nodes: ArticleTreeNode[];
  rows: ArticleNavigatorRow[];
}

const appendVisibleRows = ({
  activeArticlePath,
  depth,
  expandedDirectoryPathSet,
  nodes,
  rows,
}: AppendVisibleRowsOptions) => {
  for (const node of nodes) {
    if (node.kind === "file") {
      rows.push({
        kind: "file",
        depth,
        isActive: node.path === activeArticlePath,
        name: node.name,
        path: node.path,
      });
      continue;
    }

    const isExpanded = expandedDirectoryPathSet.has(node.path);

    rows.push({
      kind: "directory",
      depth,
      hasChildren: node.children.length > 0,
      isExpanded,
      name: node.name,
      path: node.path,
    });

    if (isExpanded) {
      appendVisibleRows({
        activeArticlePath,
        depth: depth + 1,
        expandedDirectoryPathSet,
        nodes: node.children,
        rows,
      });
    }
  }
};

const appendDirectoryPaths = (nodes: ArticleTreeNode[], paths: string[]) => {
  for (const node of nodes) {
    if (node.kind === "directory") {
      paths.push(node.path);
      appendDirectoryPaths(node.children, paths);
    }
  }
};

const findFileAncestorDirectoryPaths = (
  nodes: ArticleTreeNode[],
  filePath: string,
  ancestorDirectoryPaths: string[],
): string[] | null => {
  for (const node of nodes) {
    if (node.kind === "file" && node.path === filePath) {
      return ancestorDirectoryPaths;
    }

    if (node.kind === "directory") {
      const foundAncestorDirectoryPaths = findFileAncestorDirectoryPaths(node.children, filePath, [
        ...ancestorDirectoryPaths,
        node.path,
      ]);

      if (foundAncestorDirectoryPaths) {
        return foundAncestorDirectoryPaths;
      }
    }
  }

  return null;
};
