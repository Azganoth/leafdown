import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FolderContextState } from "@/features/folder-context";
import {
  createEmptyFolderContext,
  createFolderContext,
  createNestedArticleTree,
} from "@/test/factories/folderContext";
import { TEST_NESTED_DIRECTORY_PATH } from "@/test/fixtures/paths";
import { act, render, renderWithUser, screen, setupUser } from "@/test/utils/react";

import { useArticleNavigatorStore } from "../stores/articleNavigator";
import { ARTICLE_NAVIGATOR_TYPEAHEAD_RESET_MS } from "../utils/articleNavigatorTraversal";
import { ArticleNavigator } from "./article-navigator";

const folderContext = createFolderContext();

const nestedFolderContext = createFolderContext({ tree: createNestedArticleTree() });

const nestedFolderContextWithoutSpec = createFolderContext({
  tree: createNestedArticleTree({
    children: createNestedArticleTree().children.map((child) =>
      child.kind === "directory" ? { ...child, children: [] } : child,
    ),
  }),
});

const emptyFolderContext = createEmptyFolderContext();

const folderContextWithScanWarning = createFolderContext({
  warnings: [
    {
      kind: "readDirectoryFailed",
      path: "C:/Notes/restricted",
      message: "Access denied",
    },
  ],
});

describe("article-navigator", () => {
  beforeEach(() => useArticleNavigatorStore.getState().reset());

  it("delegates article opening without importing session workflows", async () => {
    const onOpenArticle = vi.fn();
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={folderContext}
        onOpenArticle={onOpenArticle}
      />,
    );

    await user.click(screen.getByRole("treeitem", { name: "readme.md" }));

    expect(onOpenArticle).toHaveBeenCalledWith("C:/Notes/readme.md");
  });

  it("opens an article from the keyboard", async () => {
    const onOpenArticle = vi.fn();
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={folderContext}
        onOpenArticle={onOpenArticle}
      />,
    );

    screen.getByRole("treeitem", { name: "readme.md" }).focus();
    await user.keyboard("{Enter}");

    expect(onOpenArticle).toHaveBeenCalledWith("C:/Notes/readme.md");
  });

  it("does not reopen the active article by path identity", async () => {
    const onOpenArticle = vi.fn();
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={"c:\\notes\\readme.md"}
        folderContext={folderContext}
        onOpenArticle={onOpenArticle}
      />,
    );

    await user.click(screen.getByRole("treeitem", { name: "readme.md" }));

    expect(onOpenArticle).not.toHaveBeenCalled();
  });

  it("exposes the articles as a tree named apart from the surrounding landmark", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={folderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(screen.getByRole("tree", { name: "Articles" })).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("reports nesting depth, sibling position, and expanded state on every row", () => {
    useArticleNavigatorStore.getState().expandDirectories([TEST_NESTED_DIRECTORY_PATH]);

    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(
      screen
        .getAllByRole("treeitem")
        .map((row) => [
          row.textContent,
          row.getAttribute("aria-level"),
          row.getAttribute("aria-posinset"),
          row.getAttribute("aria-setsize"),
          row.getAttribute("aria-expanded"),
        ]),
    ).toEqual([
      ["readme.md", "1", "1", "4", null],
      ["draft.markdown", "1", "2", "4", null],
      ["docs", "1", "3", "4", "true"],
      ["spec.md", "2", "1", "1", null],
      ["empty", "1", "4", "4", null],
    ]);
  });

  it("keeps an empty directory reachable instead of disabling it", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    const emptyDirectory = screen.getByRole("treeitem", { name: "empty" });
    emptyDirectory.focus();

    expect(emptyDirectory).toHaveFocus();
    expect(emptyDirectory).not.toHaveAttribute("aria-disabled");
  });

  it("marks the open document as the selected row", () => {
    render(
      <ArticleNavigator
        activeArticlePath="C:/Notes/readme.md"
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(
      screen
        .getAllByRole("treeitem")
        .map((row) => [row.textContent, row.getAttribute("aria-selected")]),
    ).toEqual([
      ["readme.md", "true"],
      ["draft.markdown", "false"],
      ["docs", "false"],
      ["empty", "false"],
    ]);
    expect(screen.queryByRole("treeitem", { current: "page" })).not.toBeInTheDocument();
  });

  it("holds a single tab stop that follows the focused row", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("treeitem").map((row) => row.tabIndex)).toEqual([0, -1, -1, -1]);

    screen.getByRole("treeitem", { name: "readme.md" }).focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getAllByRole("treeitem").map((row) => row.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it("moves focus with the arrow keys without opening a document", async () => {
    const onOpenArticle = vi.fn();
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={onOpenArticle}
      />,
    );

    screen.getByRole("treeitem", { name: "readme.md" }).focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("treeitem", { name: "draft.markdown" })).toHaveFocus();

    await user.keyboard("{End}");

    expect(screen.getByRole("treeitem", { name: "empty" })).toHaveFocus();

    await user.keyboard("{ArrowUp}{Home}");

    expect(screen.getByRole("treeitem", { name: "readme.md" })).toHaveFocus();
    expect(onOpenArticle).not.toHaveBeenCalled();
  });

  it("expands, descends, and collapses a directory with the horizontal arrows", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    const directory = screen.getByRole("treeitem", { name: "docs" });
    directory.focus();
    await user.keyboard("{ArrowRight}");

    expect(directory).toHaveAttribute("aria-expanded", "true");
    expect(directory).toHaveFocus();

    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("treeitem", { name: "spec.md" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}");

    expect(directory).toHaveFocus();

    await user.keyboard("{ArrowLeft}");

    expect(directory).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: "spec.md" })).not.toBeInTheDocument();
  });

  it("keeps the tab stop on the nearest surviving row when a directory collapses", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    screen.getByRole("treeitem", { name: "docs" }).focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");

    expect(screen.getByRole("treeitem", { name: "spec.md" })).toHaveFocus();

    act(() => useArticleNavigatorStore.getState().toggleDirectory(TEST_NESTED_DIRECTORY_PATH));

    expect(screen.getByRole("treeitem", { name: "docs" }).tabIndex).toBe(0);
    expect(screen.getAllByRole("treeitem").filter((row) => row.tabIndex === 0)).toHaveLength(1);
  });

  it("follows the tab stop when a rebuild removes the focused row", () => {
    useArticleNavigatorStore.getState().expandDirectories([TEST_NESTED_DIRECTORY_PATH]);

    const { rerender } = render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    act(() => screen.getByRole("treeitem", { name: "spec.md" }).focus());
    rerender(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContextWithoutSpec}
        onOpenArticle={vi.fn()}
      />,
    );

    const directory = screen.getByRole("treeitem", { name: "docs" });

    expect(directory).toHaveFocus();
    expect(directory.tabIndex).toBe(0);
  });

  it("leaves focus outside the navigator when a rebuild removes a row", () => {
    useArticleNavigatorStore.getState().expandDirectories([TEST_NESTED_DIRECTORY_PATH]);

    const renderTree = (folderContext: FolderContextState) => (
      <>
        <button type="button">Editor</button>
        <ArticleNavigator
          activeArticlePath={null}
          folderContext={folderContext}
          onOpenArticle={vi.fn()}
        />
      </>
    );
    const { rerender } = render(renderTree(nestedFolderContext));

    act(() => screen.getByRole("treeitem", { name: "spec.md" }).focus());
    act(() => screen.getByRole("button", { name: "Editor" }).focus());
    rerender(renderTree(nestedFolderContextWithoutSpec));

    expect(screen.getByRole("button", { name: "Editor" })).toHaveFocus();
  });

  it("does not claim focus from the document body when a rebuild removes a row", () => {
    useArticleNavigatorStore.getState().expandDirectories([TEST_NESTED_DIRECTORY_PATH]);

    const { rerender } = render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    act(() => screen.getByRole("treeitem", { name: "spec.md" }).focus());
    act(() => screen.getByRole("treeitem", { name: "spec.md" }).blur());
    rerender(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContextWithoutSpec}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(document.body).toHaveFocus();
  });

  it("focuses the revealed row and hands it the tab stop", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    act(() =>
      useArticleNavigatorStore
        .getState()
        .requestRevealArticle(`${TEST_NESTED_DIRECTORY_PATH}/spec.md`, [
          TEST_NESTED_DIRECTORY_PATH,
        ]),
    );

    const revealedRow = screen.getByRole("treeitem", { name: "spec.md" });

    expect(revealedRow).toHaveFocus();
    expect(revealedRow.tabIndex).toBe(0);
  });

  it("leaves focus alone when an unrelated directory expands after a reveal", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    act(() =>
      useArticleNavigatorStore
        .getState()
        .requestRevealArticle(`${TEST_NESTED_DIRECTORY_PATH}/spec.md`, [
          TEST_NESTED_DIRECTORY_PATH,
        ]),
    );
    await user.keyboard("{Home}");

    expect(screen.getByRole("treeitem", { name: "readme.md" })).toHaveFocus();

    act(() => useArticleNavigatorStore.getState().expandDirectories(["C:/Notes/empty"]));

    expect(screen.getByRole("treeitem", { name: "readme.md" })).toHaveFocus();
  });

  describe("typeahead", () => {
    // Only the clock is faked: user-event's own waits still need real timers.
    beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
    afterEach(() => vi.useRealTimers());

    it("jumps to a row by name and forgets the search after a pause", async () => {
      const user = setupUser({ delay: null });
      render(
        <ArticleNavigator
          activeArticlePath={null}
          folderContext={nestedFolderContext}
          onOpenArticle={vi.fn()}
        />,
      );

      screen.getByRole("treeitem", { name: "readme.md" }).focus();
      await user.keyboard("d");

      expect(screen.getByRole("treeitem", { name: "draft.markdown" })).toHaveFocus();

      await user.keyboard("o");

      expect(screen.getByRole("treeitem", { name: "docs" })).toHaveFocus();

      vi.setSystemTime(Date.now() + ARTICLE_NAVIGATOR_TYPEAHEAD_RESET_MS + 1);
      await user.keyboard("d");

      expect(screen.getByRole("treeitem", { name: "draft.markdown" })).toHaveFocus();
    });

    it("does not open a document while searching", async () => {
      const onOpenArticle = vi.fn();
      const user = setupUser({ delay: null });
      render(
        <ArticleNavigator
          activeArticlePath={null}
          folderContext={nestedFolderContext}
          onOpenArticle={onOpenArticle}
        />,
      );

      screen.getByRole("treeitem", { name: "readme.md" }).focus();
      await user.keyboard("dra t");

      expect(screen.getByRole("treeitem", { name: "draft.markdown" })).toHaveFocus();
      expect(onOpenArticle).not.toHaveBeenCalled();
    });

    it("opens the focused article on space when no search is running", async () => {
      const onOpenArticle = vi.fn();
      const user = setupUser({ delay: null });
      render(
        <ArticleNavigator
          activeArticlePath={null}
          folderContext={nestedFolderContext}
          onOpenArticle={onOpenArticle}
        />,
      );

      screen.getByRole("treeitem", { name: "readme.md" }).focus();
      await user.keyboard(" ");

      expect(onOpenArticle).toHaveBeenCalledWith("C:/Notes/readme.md");
    });
  });

  it("shows when the active document is outside the current folder context", () => {
    render(
      <ArticleNavigator
        activeArticlePath="C:/Other/readme.md"
        folderContext={folderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Current document is outside this folder context."),
    ).toBeInTheDocument();
  });

  it("does not show the detached-document message for articles inside the folder context", () => {
    render(
      <ArticleNavigator
        activeArticlePath="C:/Notes/drafts/readme.md"
        folderContext={folderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(
      screen.queryByText("Current document is outside this folder context."),
    ).not.toBeInTheDocument();
  });

  it("shows one empty folder context message", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={emptyFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(screen.getByText("No supported Markdown files found.")).toBeInTheDocument();
    expect(screen.queryByText("No visible folder entries.")).not.toBeInTheDocument();
  });

  it("shows scan warnings in the navigator", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={folderContextWithScanWarning}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(screen.getByText(/Some folder entries could not be scanned/u)).toBeInTheDocument();
    expect(screen.getByText(/1 issue found/u)).toBeInTheDocument();
  });

  it("qualifies the empty message when scan warnings exist", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={createEmptyFolderContext({
          warnings: folderContextWithScanWarning.warnings,
        })}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No supported Markdown files found in scanned entries."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No supported Markdown files found.")).not.toBeInTheDocument();
  });
});
