import { isSamePath, PathMap, PathSet } from "@/lib/path";
import { findTreeNodeAncestors, flattenTree, type TreeTraversalEntry } from "@/lib/tree";

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

export interface ArticleNavigatorFileRow extends ArticleNavigatorRowBase {
  kind: "file";
  isActive: boolean;
}

export type ArticleNavigatorEntryKind = "directory" | "file";

/** The row that holds the name of an entry being created, before it exists on disk. */
export interface ArticleNavigatorDraftRow extends ArticleNavigatorRowBase {
  kind: "draft";
  entryKind: ArticleNavigatorEntryKind;
}

export type ArticleNavigatorRow =
  | ArticleNavigatorFileRow
  | ArticleNavigatorDirectoryRow
  | ArticleNavigatorDraftRow;

export interface ArticleNavigatorDraft {
  entryKind: ArticleNavigatorEntryKind;
  parentPath: string;
}

interface BuildArticleNavigatorRowsOptions {
  activeArticlePath: string | null;
  draft?: ArticleNavigatorDraft | null;
  expandedDirectoryPaths: string[];
  tree: ArticleTree;
}

interface ArticleNavigatorDraftNode {
  kind: "draft";
  entryKind: ArticleNavigatorEntryKind;
  name: string;
  path: string;
}

type ArticleNavigatorNode = ArticleTreeNode | ArticleNavigatorDraftNode;

// NUL cannot appear in a native path, so the draft key never matches a real entry.
export const getArticleNavigatorDraftPath = (parentPath: string) => `${parentPath}\u0000draft`;

export const buildArticleNavigatorRows = ({
  activeArticlePath,
  draft = null,
  expandedDirectoryPaths,
  tree,
}: BuildArticleNavigatorRowsOptions): ArticleNavigatorRow[] => {
  const expandedDirectoryPathSet = new PathSet(expandedDirectoryPaths);
  const activeArticlePaths = new PathSet(activeArticlePath ? [activeArticlePath] : []);
  const roots: ArticleNavigatorNode[] = tree.children;
  const entries = flattenTree<ArticleNavigatorNode>({
    getChildren: (node) => getNavigatorNodeChildren(node, draft),
    roots:
      draft && isSamePath(draft.parentPath, tree.path) ? [toDraftNode(draft), ...roots] : roots,
    shouldTraverseChildren: ({ node }) =>
      node.kind === "directory" && expandedDirectoryPathSet.has(node.path),
  });
  const positions = getTreePositions(entries.map(({ depth }) => depth));

  return entries.map(({ depth, node }, index): ArticleNavigatorRow => {
    const { parentIndex, posInSet, setSize } = positions[index];

    if (node.kind === "draft") {
      return {
        kind: "draft",
        depth,
        entryKind: node.entryKind,
        name: node.name,
        parentIndex,
        path: node.path,
        posInSet,
        setSize,
      };
    }

    return node.kind === "file"
      ? {
          kind: "file",
          depth,
          isActive: activeArticlePaths.has(node.path),
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

export const getArticleNavigatorRowIndexes = (rows: ArticleNavigatorRow[]) => {
  const rowIndexes = new PathMap<number>();

  rows.forEach((row, index) => rowIndexes.set(row.path, index));

  return rowIndexes;
};

export const getArticleDirectoryPaths = (tree: ArticleTree) =>
  flattenArticleTree(tree).flatMap(({ node }) => (node.kind === "directory" ? [node.path] : []));

export const getArticleFileCount = (tree: ArticleTree) =>
  flattenArticleTree(tree).filter(({ node }) => node.kind === "file").length;

export const filterArticleTreeByArticleName = (tree: ArticleTree, query: string): ArticleTree => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return tree;
  }

  return {
    ...tree,
    children: filterArticleTreeNodesByArticleName(tree.children, normalizedQuery),
  };
};

const filterArticleTreeNodesByArticleName = (
  nodes: ArticleTreeNode[],
  normalizedQuery: string,
): ArticleTreeNode[] =>
  nodes.flatMap((node): ArticleTreeNode[] => {
    if (node.kind === "file") {
      return node.name.toLowerCase().includes(normalizedQuery) ? [node] : [];
    }

    const children = filterArticleTreeNodesByArticleName(node.children, normalizedQuery);

    return children.length > 0 ? [{ ...node, children }] : [];
  });
export const getArticleAncestorDirectoryPaths = (
  tree: ArticleTree,
  filePath: string,
): string[] | null => {
  const filePaths = new PathSet([filePath]);

  return (
    findTreeNodeAncestors({
      getChildren: getArticleTreeNodeChildren,
      matches: (node) => node.kind === "file" && filePaths.has(node.path),
      roots: tree.children,
    })?.flatMap((node) => (node.kind === "directory" ? [node.path] : [])) ?? null
  );
};

const getArticleTreeNodeChildren = (node: ArticleTreeNode) =>
  node.kind === "directory" ? node.children : [];

const toDraftNode = ({
  entryKind,
  parentPath,
}: ArticleNavigatorDraft): ArticleNavigatorDraftNode => ({
  kind: "draft",
  entryKind,
  name: "",
  path: getArticleNavigatorDraftPath(parentPath),
});

const getNavigatorNodeChildren = (
  node: ArticleNavigatorNode,
  draft: ArticleNavigatorDraft | null,
): ArticleNavigatorNode[] => {
  if (node.kind !== "directory") {
    return [];
  }

  return draft && isSamePath(draft.parentPath, node.path)
    ? [toDraftNode(draft), ...node.children]
    : node.children;
};

const flattenArticleTree = (
  tree: ArticleTree,
  shouldTraverseChildren?: (entry: TreeTraversalEntry<ArticleTreeNode>) => boolean,
) =>
  flattenTree({
    getChildren: getArticleTreeNodeChildren,
    roots: tree.children,
    shouldTraverseChildren,
  });

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
