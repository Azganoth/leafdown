import { describe, expect, it } from "vitest";

import { createArticleTree } from "@/test/factories/folderContext";

import {
  buildArticleNavigatorRows,
  getArticleAncestorDirectoryPaths,
  getArticleDirectoryPaths,
} from "./articleNavigatorRows";

const articleTree = createArticleTree({
  children: [
    {
      kind: "directory",
      name: "docs",
      path: "C:/Notes/docs",
      children: [{ kind: "file", name: "guide.md", path: "C:/Notes/docs/guide.md" }],
    },
    {
      kind: "directory",
      name: "drafts",
      path: "C:/Notes/drafts",
      children: [
        {
          kind: "directory",
          name: "archive",
          path: "C:/Notes/drafts/archive",
          children: [{ kind: "file", name: "old.md", path: "C:/Notes/drafts/archive/old.md" }],
        },
      ],
    },
    { kind: "file", name: "readme.md", path: "C:/Notes/readme.md" },
  ],
});

describe("article navigator rows", () => {
  it("builds visible rows from expanded article directories", () => {
    expect(
      buildArticleNavigatorRows({
        activeArticlePath: "c:\\notes\\docs\\guide.md",
        expandedDirectoryPaths: ["c:\\notes\\docs\\"],
        tree: articleTree,
      }),
    ).toEqual([
      {
        kind: "directory",
        depth: 0,
        hasChildren: true,
        isExpanded: true,
        name: "docs",
        parentIndex: null,
        path: "C:/Notes/docs",
        posInSet: 1,
        setSize: 3,
      },
      {
        kind: "file",
        depth: 1,
        isActive: true,
        name: "guide.md",
        parentIndex: 0,
        path: "C:/Notes/docs/guide.md",
        posInSet: 1,
        setSize: 1,
      },
      {
        kind: "directory",
        depth: 0,
        hasChildren: true,
        isExpanded: false,
        name: "drafts",
        parentIndex: null,
        path: "C:/Notes/drafts",
        posInSet: 2,
        setSize: 3,
      },
      {
        kind: "file",
        depth: 0,
        isActive: false,
        name: "readme.md",
        parentIndex: null,
        path: "C:/Notes/readme.md",
        posInSet: 3,
        setSize: 3,
      },
    ]);
  });

  it("scopes position and size to siblings under the same parent", () => {
    expect(
      buildArticleNavigatorRows({
        activeArticlePath: null,
        expandedDirectoryPaths: ["C:/Notes/docs", "C:/Notes/drafts", "C:/Notes/drafts/archive"],
        tree: articleTree,
      }).map(({ depth, name, parentIndex, posInSet, setSize }) => ({
        depth,
        name,
        parentIndex,
        posInSet,
        setSize,
      })),
    ).toEqual([
      { depth: 0, name: "docs", parentIndex: null, posInSet: 1, setSize: 3 },
      { depth: 1, name: "guide.md", parentIndex: 0, posInSet: 1, setSize: 1 },
      { depth: 0, name: "drafts", parentIndex: null, posInSet: 2, setSize: 3 },
      { depth: 1, name: "archive", parentIndex: 2, posInSet: 1, setSize: 1 },
      { depth: 2, name: "old.md", parentIndex: 3, posInSet: 1, setSize: 1 },
      { depth: 0, name: "readme.md", parentIndex: null, posInSet: 3, setSize: 3 },
    ]);
  });

  it("keeps sibling size independent of how many descendants are expanded", () => {
    const collapsedRows = buildArticleNavigatorRows({
      activeArticlePath: null,
      expandedDirectoryPaths: [],
      tree: articleTree,
    });
    const expandedRows = buildArticleNavigatorRows({
      activeArticlePath: null,
      expandedDirectoryPaths: ["C:/Notes/docs"],
      tree: articleTree,
    });

    expect(collapsedRows.map(({ posInSet, setSize }) => [posInSet, setSize])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    expect(
      expandedRows
        .filter(({ depth }) => depth === 0)
        .map(({ posInSet, setSize }) => [posInSet, setSize]),
    ).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("collects directory paths in tree order", () => {
    expect(getArticleDirectoryPaths(articleTree)).toEqual([
      "C:/Notes/docs",
      "C:/Notes/drafts",
      "C:/Notes/drafts/archive",
    ]);
  });

  it("finds article ancestor directory paths", () => {
    expect(
      getArticleAncestorDirectoryPaths(articleTree, "c:\\notes\\drafts\\archive\\old.md"),
    ).toEqual(["C:/Notes/drafts", "C:/Notes/drafts/archive"]);
    expect(getArticleAncestorDirectoryPaths(articleTree, "C:/Notes/missing.md")).toBeNull();
  });
});
