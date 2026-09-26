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
}: FindTreeNodeOptions<TNode>): TNode[] | null => {
  const ancestors: TNode[] = [];

  return collectTreeNodeAncestors({ ancestors, getChildren, matches, nodes: roots })
    ? ancestors
    : null;
};

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

interface CollectTreeNodeAncestorsOptions<TNode> {
  ancestors: TNode[];
  getChildren: (node: TNode) => readonly TNode[];
  matches: (node: TNode) => boolean;
  nodes: readonly TNode[];
}

const collectTreeNodeAncestors = <TNode>({
  ancestors,
  getChildren,
  matches,
  nodes,
}: CollectTreeNodeAncestorsOptions<TNode>): boolean => {
  for (const node of nodes) {
    if (matches(node)) {
      return true;
    }

    ancestors.push(node);

    if (collectTreeNodeAncestors({ ancestors, getChildren, matches, nodes: getChildren(node) })) {
      return true;
    }

    ancestors.pop();
  }

  return false;
};
