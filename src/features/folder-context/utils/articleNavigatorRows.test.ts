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
        path: "C:/Notes/docs",
      },
      {
        kind: "file",
        depth: 1,
        isActive: true,
        name: "guide.md",
        path: "C:/Notes/docs/guide.md",
      },
      {
        kind: "directory",
        depth: 0,
        hasChildren: true,
        isExpanded: false,
        name: "drafts",
        path: "C:/Notes/drafts",
      },
      {
        kind: "file",
        depth: 0,
        isActive: false,
        name: "readme.md",
        path: "C:/Notes/readme.md",
      },
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
