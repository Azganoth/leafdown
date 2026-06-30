import { describe, expect, it } from "vitest";

import { findTreeNode, findTreeNodeAncestors, flattenTree } from "./tree";

interface TestTreeNode {
  children?: TestTreeNode[];
  id: string;
}

const tree: TestTreeNode[] = [
  {
    id: "docs",
    children: [
      { id: "guide" },
      {
        id: "api",
        children: [{ id: "reference" }],
      },
    ],
  },
  { id: "readme" },
];

const getChildren = (node: TestTreeNode) => node.children ?? [];

describe("tree utilities", () => {
  it("flattens trees in preorder with depth", () => {
    expect(
      flattenTree({
        getChildren,
        roots: tree,
      }),
    ).toEqual([
      { depth: 0, node: tree[0] },
      { depth: 1, node: tree[0]?.children?.[0] },
      { depth: 1, node: tree[0]?.children?.[1] },
      { depth: 2, node: tree[0]?.children?.[1]?.children?.[0] },
      { depth: 0, node: tree[1] },
    ]);
  });

  it("can skip child traversal for matching nodes", () => {
    expect(
      flattenTree({
        getChildren,
        roots: tree,
        shouldTraverseChildren: ({ node }) => node.id !== "docs",
      }).map(({ node }) => node.id),
    ).toEqual(["docs", "readme"]);
  });

  it("finds a nested node", () => {
    expect(
      findTreeNode({
        getChildren,
        matches: (node) => node.id === "reference",
        roots: tree,
      }),
    ).toBe(tree[0]?.children?.[1]?.children?.[0]);
  });

  it("finds ancestor nodes for a nested node", () => {
    expect(
      findTreeNodeAncestors({
        getChildren,
        matches: (node) => node.id === "reference",
        roots: tree,
      }),
    ).toEqual([tree[0], tree[0]?.children?.[1]]);
  });

  it("returns null when no node matches", () => {
    expect(
      findTreeNodeAncestors({
        getChildren,
        matches: (node) => node.id === "missing",
        roots: tree,
      }),
    ).toBeNull();
  });
});
