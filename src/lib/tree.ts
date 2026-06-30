export interface TreeTraversalEntry<TNode> {
  depth: number;
  node: TNode;
}

interface TreeTraversalOptions<TNode> {
  getChildren: (node: TNode) => readonly TNode[];
  roots: readonly TNode[];
}

interface FlattenTreeOptions<TNode> extends TreeTraversalOptions<TNode> {
  shouldTraverseChildren?: (entry: TreeTraversalEntry<TNode>) => boolean;
}

interface FindTreeNodeOptions<TNode> extends TreeTraversalOptions<TNode> {
  matches: (node: TNode) => boolean;
}

export const flattenTree = <TNode>({
  getChildren,
  roots,
  shouldTraverseChildren,
}: FlattenTreeOptions<TNode>) => {
  const entries: TreeTraversalEntry<TNode>[] = [];

  appendFlattenedEntries({
    depth: 0,
    entries,
    getChildren,
    nodes: roots,
    shouldTraverseChildren,
  });

  return entries;
};

export const findTreeNode = <TNode>({
  getChildren,
  matches,
  roots,
}: FindTreeNodeOptions<TNode>): TNode | null => {
  for (const node of roots) {
    if (matches(node)) {
      return node;
    }

    const foundNode = findTreeNode({ getChildren, matches, roots: getChildren(node) });

    if (foundNode) {
      return foundNode;
    }
  }

  return null;
};

export const findTreeNodeAncestors = <TNode>({
  getChildren,
  matches,
  roots,
}: FindTreeNodeOptions<TNode>): TNode[] | null =>
  findTreeNodeAncestorPath({ ancestorPath: [], getChildren, matches, nodes: roots });

interface AppendFlattenedEntriesOptions<TNode> {
  depth: number;
  entries: TreeTraversalEntry<TNode>[];
  getChildren: (node: TNode) => readonly TNode[];
  nodes: readonly TNode[];
  shouldTraverseChildren: ((entry: TreeTraversalEntry<TNode>) => boolean) | undefined;
}

const appendFlattenedEntries = <TNode>({
  depth,
  entries,
  getChildren,
  nodes,
  shouldTraverseChildren,
}: AppendFlattenedEntriesOptions<TNode>) => {
  for (const node of nodes) {
    const entry = { depth, node };
    entries.push(entry);

    if (shouldTraverseChildren && !shouldTraverseChildren(entry)) {
      continue;
    }

    appendFlattenedEntries({
      depth: depth + 1,
      entries,
      getChildren,
      nodes: getChildren(node),
      shouldTraverseChildren,
    });
  }
};

interface FindTreeNodeAncestorPathOptions<TNode> {
  ancestorPath: TNode[];
  getChildren: (node: TNode) => readonly TNode[];
  matches: (node: TNode) => boolean;
  nodes: readonly TNode[];
}

const findTreeNodeAncestorPath = <TNode>({
  ancestorPath,
  getChildren,
  matches,
  nodes,
}: FindTreeNodeAncestorPathOptions<TNode>): TNode[] | null => {
  for (const node of nodes) {
    if (matches(node)) {
      return ancestorPath;
    }

    const foundAncestorPath = findTreeNodeAncestorPath({
      ancestorPath: [...ancestorPath, node],
      getChildren,
      matches,
      nodes: getChildren(node),
    });

    if (foundAncestorPath) {
      return foundAncestorPath;
    }
  }

  return null;
};
