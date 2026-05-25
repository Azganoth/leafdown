import type { MarkdownFolderTree, MarkdownFolderTreeNode } from "@/stores/session";

interface FileTreeRowBase {
  depth: number;
  name: string;
  path: string;
}

export interface FileTreeDirectoryRow extends FileTreeRowBase {
  kind: "directory";
  hasChildren: boolean;
  isExpanded: boolean;
}

export interface FileTreeFileRow extends FileTreeRowBase {
  kind: "file";
  isActive: boolean;
}

export type FileTreeRow = FileTreeDirectoryRow | FileTreeFileRow;

export interface BuildFileTreeRowsOptions {
  activeFilePath: string | null;
  expandedDirectoryPaths: string[];
  tree: MarkdownFolderTree;
}

export const buildFileTreeRows = ({
  activeFilePath,
  expandedDirectoryPaths,
  tree,
}: BuildFileTreeRowsOptions): FileTreeRow[] => {
  const expandedDirectoryPathSet = new Set(expandedDirectoryPaths);
  const rows: FileTreeRow[] = [];

  appendVisibleRows({
    activeFilePath,
    depth: 0,
    expandedDirectoryPathSet,
    nodes: tree.children,
    rows,
  });

  return rows;
};

export const getDirectoryPaths = (tree: MarkdownFolderTree) => {
  const paths: string[] = [];

  appendDirectoryPaths(tree.children, paths);

  return paths;
};

export const getFileAncestorDirectoryPaths = (
  tree: MarkdownFolderTree,
  filePath: string,
): string[] | null => findFileAncestorDirectoryPaths(tree.children, filePath, []);

export const treeHasFilePath = (tree: MarkdownFolderTree, filePath: string) =>
  getFileAncestorDirectoryPaths(tree, filePath) !== null;

interface AppendVisibleRowsOptions {
  activeFilePath: string | null;
  depth: number;
  expandedDirectoryPathSet: Set<string>;
  nodes: MarkdownFolderTreeNode[];
  rows: FileTreeRow[];
}

const appendVisibleRows = ({
  activeFilePath,
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
        isActive: node.path === activeFilePath,
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
        activeFilePath,
        depth: depth + 1,
        expandedDirectoryPathSet,
        nodes: node.children,
        rows,
      });
    }
  }
};

const appendDirectoryPaths = (nodes: MarkdownFolderTreeNode[], paths: string[]) => {
  for (const node of nodes) {
    if (node.kind === "directory") {
      paths.push(node.path);
      appendDirectoryPaths(node.children, paths);
    }
  }
};

const findFileAncestorDirectoryPaths = (
  nodes: MarkdownFolderTreeNode[],
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
