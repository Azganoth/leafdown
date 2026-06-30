import { beforeEach, describe, expect, it } from "vitest";

import { useArticleNavigatorStore } from "./articleNavigator";

describe("article navigator store", () => {
  beforeEach(() => useArticleNavigatorStore.getState().reset());

  it("toggles directory expansion", () => {
    const store = useArticleNavigatorStore.getState();

    store.toggleDirectory("C:/Notes/docs");

    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual(["C:/Notes/docs"]);

    useArticleNavigatorStore.getState().toggleDirectory("C:/Notes/docs");

    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([]);
  });

  it("toggles directory expansion by path identity", () => {
    const store = useArticleNavigatorStore.getState();

    store.toggleDirectory("C:/Notes/docs");
    store.toggleDirectory("c:\\notes\\docs\\");

    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([]);
  });

  it("sets a directory expansion state explicitly", () => {
    const store = useArticleNavigatorStore.getState();

    store.setDirectoryExpanded("C:/Notes/docs", true);
    store.setDirectoryExpanded("C:/Notes/drafts", true);
    store.setDirectoryExpanded("C:/Notes/docs", true);

    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([
      "C:/Notes/docs",
      "C:/Notes/drafts",
    ]);

    useArticleNavigatorStore.getState().setDirectoryExpanded("C:/Notes/docs", false);

    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual(["C:/Notes/drafts"]);
  });

  it("expands directories without duplicating existing paths", () => {
    const store = useArticleNavigatorStore.getState();

    store.expandDirectories(["C:/Notes/docs"]);
    store.expandDirectories(["c:\\notes\\docs\\", "C:/Notes/drafts"]);

    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([
      "C:/Notes/docs",
      "C:/Notes/drafts",
    ]);
  });

  it("collapses all expanded directories", () => {
    useArticleNavigatorStore.getState().expandDirectories(["C:/Notes/docs", "C:/Notes/drafts"]);

    useArticleNavigatorStore.getState().collapseAll();

    expect(useArticleNavigatorStore.getState().expandedDirectoryPaths).toEqual([]);
  });

  it("requests article reveal by expanding ancestors and incrementing request ids", () => {
    const store = useArticleNavigatorStore.getState();

    store.requestRevealArticle("C:/Notes/docs/readme.md", ["C:/Notes/docs"]);
    store.requestRevealArticle("C:/Notes/docs/readme.md", ["C:/Notes/docs"]);

    expect(useArticleNavigatorStore.getState()).toMatchObject({
      expandedDirectoryPaths: ["C:/Notes/docs"],
      revealArticlePath: "C:/Notes/docs/readme.md",
      revealRequestId: 2,
    });
  });

  it("resets navigator state", () => {
    useArticleNavigatorStore
      .getState()
      .requestRevealArticle("C:/Notes/docs/readme.md", ["C:/Notes/docs"]);

    useArticleNavigatorStore.getState().reset();

    expect(useArticleNavigatorStore.getState()).toMatchObject({
      expandedDirectoryPaths: [],
      revealArticlePath: null,
      revealRequestId: 0,
    });
  });
});
