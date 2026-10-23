// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FolderContextState } from "@/features/folder-context";
import {
  createArticleTree,
  createEmptyFolderContext,
  createFolderContext,
  createNestedArticleTree,
} from "@/test/factories/folderContext";
import {
  TEST_MARKDOWN_FILE_PATH,
  TEST_NESTED_DIRECTORY_PATH,
  TEST_NOTES_FOLDER_PATH,
} from "@/test/fixtures/paths";
import {
  act,
  render,
  renderWithUser,
  screen,
  setupUser,
  waitFor,
  within,
} from "@/test/utils/react";
import { hoverAndQueryTooltip, hoverTooltip, setCutShort } from "@/test/utils/tooltip";

import { useArticleNavigatorStore } from "../stores/articleNavigator";
import { ARTICLE_NAVIGATOR_TYPEAHEAD_RESET_MS } from "../utils/articleNavigatorTraversal";
import {
  ArticleNavigator,
  type ArticleNavigatorEntryActionResult,
  type ArticleNavigatorEntryActions,
} from "./article-navigator";

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

  it("asks to keep an article that is double-clicked, but not a directory", async () => {
    const onKeepArticle = vi.fn();
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onKeepArticle={onKeepArticle}
        onOpenArticle={vi.fn()}
      />,
    );

    await user.dblClick(screen.getByRole("treeitem", { name: "readme.md" }));
    await user.dblClick(screen.getByRole("treeitem", { name: "docs" }));

    expect(onKeepArticle).toHaveBeenCalledExactlyOnceWith("C:/Notes/readme.md");
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

  it("titles the header with the folder's name alone", () => {
    const { container } = render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-slot="card-title"]')).toHaveTextContent(/^Notes$/u);
  });

  it("shows the folder's full path in a tooltip on its name", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={folderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(await hoverTooltip(user, screen.getByText("Notes"))).toHaveTextContent(
      TEST_NOTES_FOLDER_PATH,
    );
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

  it("filters articles through collapsed folders without changing the restored tree", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    const filter = screen.getByRole("textbox", { name: "Filter articles" });
    expect(filter).toHaveAttribute("type", "text");

    await user.type(filter, "spec");

    expect(
      await hoverAndQueryTooltip(
        user,
        screen.getByRole("button", { name: "Clear article filter" }),
      ),
    ).toBeNull();
    expect(screen.getByRole("treeitem", { name: "docs" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("treeitem", { name: "spec.md" })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "readme.md" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear article filter" }));

    expect(screen.getByRole("treeitem", { name: "docs" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("treeitem", { name: "spec.md" })).not.toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "readme.md" })).toBeInTheDocument();
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

    const renderTree = (treeFolderContext: FolderContextState) => (
      <>
        <button type="button">Editor</button>
        <ArticleNavigator
          activeArticlePath={null}
          folderContext={treeFolderContext}
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
        .requestReveal(`${TEST_NESTED_DIRECTORY_PATH}/spec.md`, [TEST_NESTED_DIRECTORY_PATH]),
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
        .requestReveal(`${TEST_NESTED_DIRECTORY_PATH}/spec.md`, [TEST_NESTED_DIRECTORY_PATH]),
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

const mixedFolderTree = createArticleTree({
  children: [
    {
      kind: "directory",
      name: "assets",
      path: `${TEST_NOTES_FOLDER_PATH}/assets`,
      children: [
        {
          kind: "unsupportedFile",
          name: "cover.png",
          path: `${TEST_NOTES_FOLDER_PATH}/assets/cover.png`,
        },
      ],
    },
    { kind: "directory", name: "empty", path: `${TEST_NOTES_FOLDER_PATH}/empty`, children: [] },
    { kind: "unsupportedFile", name: "manual.pdf", path: `${TEST_NOTES_FOLDER_PATH}/manual.pdf` },
    { kind: "file", name: "readme.md", path: TEST_MARKDOWN_FILE_PATH },
  ],
});

const mixedFolderContext = createFolderContext({ tree: mixedFolderTree });

const assetsOnlyFolderContext = createEmptyFolderContext({
  tree: createArticleTree({
    children: mixedFolderTree.children.filter(
      (child) => child.kind !== "file" && child.name !== "empty",
    ),
  }),
});

const getTreeItemNames = () =>
  screen.queryAllByRole("treeitem").map((item) => item.textContent?.trim());

describe("article-navigator default listing", () => {
  beforeEach(() => useArticleNavigatorStore.getState().reset());

  it("lists articles and empty directories, leaving out other files and their folders", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(getTreeItemNames()).toEqual(["empty", "readme.md"]);
  });

  it("filters articles as when every file is shown", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    const filter = screen.getByRole("textbox", { name: "Filter articles" });
    await user.type(filter, "manual");

    expect(screen.queryByRole("treeitem")).not.toBeInTheDocument();
    expect(screen.getByText("No matching articles.")).toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, "read");

    expect(getTreeItemNames()).toEqual(["readme.md"]);
  });

  it("shows only the empty Markdown message for a folder of other files", () => {
    const { rerender } = render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={assetsOnlyFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(screen.getByText("No supported Markdown files found.")).toBeInTheDocument();
    expect(screen.queryByRole("treeitem")).not.toBeInTheDocument();

    rerender(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={assetsOnlyFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    expect(screen.getByText("No supported Markdown files found.")).toBeInTheDocument();
    expect(getTreeItemNames()).toEqual(["assets", "manual.pdf"]);
  });

  it("keeps an empty folder listed beside the empty Markdown message", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={createEmptyFolderContext({
          tree: createArticleTree({
            children: mixedFolderTree.children.filter((child) => child.kind !== "file"),
          }),
        })}
        onOpenArticle={vi.fn()}
      />,
    );

    expect(screen.getByText("No supported Markdown files found.")).toBeInTheDocument();
    expect(getTreeItemNames()).toEqual(["empty"]);
  });

  it("hands focus to the row that inherits the tab stop when hiding other files removes it", () => {
    const { rerender } = render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    act(() => screen.getByRole("treeitem", { name: "manual.pdf" }).focus());
    rerender(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );

    const firstRow = screen.getByRole("treeitem", { name: "empty" });

    expect(firstRow).toHaveFocus();
    expect(firstRow.tabIndex).toBe(0);
    expect(screen.getAllByRole("treeitem").filter((row) => row.tabIndex === 0)).toHaveLength(1);
  });
});

describe("article-navigator with all files shown", () => {
  beforeEach(() => useArticleNavigatorStore.getState().reset());

  it("shows unsupported files as rows that say Leafdown cannot open them", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    const row = screen.getByRole("treeitem", { name: "manual.pdf" });

    expect(row).toHaveAttribute("aria-description", "Leafdown can only open Markdown files.");
    expect(row).not.toHaveAttribute("title");
    expect((await hoverTooltip(user, row)).textContent).toBe(
      "manual.pdf\nLeafdown can only open Markdown files.",
    );
    expect(row).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("treeitem", { name: "readme.md" })).not.toHaveAttribute(
      "aria-description",
    );
  });

  it("shows a row's name in a tooltip only while the row cuts it short", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={nestedFolderContext}
        onOpenArticle={vi.fn()}
      />,
    );
    const row = screen.getByRole("treeitem", { name: "readme.md" });
    const elsewhere = screen.getByRole("treeitem", { name: "docs" });
    const name = within(row).getByText("readme.md");

    expect(await hoverAndQueryTooltip(user, row)).toBeNull();

    setCutShort(name, true);
    await user.hover(elsewhere);

    expect((await hoverTooltip(user, row)).textContent).toBe("readme.md");

    setCutShort(name, false);
    await user.hover(elsewhere);

    expect(await hoverAndQueryTooltip(user, row)).toBeNull();
  });

  it("focuses an unsupported file without opening it from a click, Enter, or Space", async () => {
    const onOpenArticle = vi.fn();
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={onOpenArticle}
        showAllFiles
      />,
    );

    const row = screen.getByRole("treeitem", { name: "manual.pdf" });
    await user.click(row);

    expect(row).toHaveFocus();
    expect(row).toHaveAttribute("tabindex", "0");

    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onOpenArticle).not.toHaveBeenCalled();
    expect(row).toHaveFocus();
  });

  it("tells a folder of unsupported files from an empty folder", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    const assets = screen.getByRole("treeitem", { name: "assets" });

    expect(assets).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("treeitem", { name: "empty" })).not.toHaveAttribute("aria-expanded");

    assets.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");

    expect(screen.getByRole("treeitem", { name: "cover.png" })).toHaveFocus();
  });

  it("filters articles only", async () => {
    const { user } = renderWithUser(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    const filter = screen.getByRole("textbox", { name: "Filter articles" });
    await user.type(filter, "manual");

    expect(screen.queryByRole("treeitem")).not.toBeInTheDocument();
    expect(screen.getByText("No matching articles.")).toBeInTheDocument();

    await user.clear(filter);
    await user.type(filter, "e");

    expect(screen.getByRole("treeitem", { name: "readme.md" })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "manual.pdf" })).not.toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "cover.png" })).not.toBeInTheDocument();
  });

  it("lists unsupported files beside the empty Markdown message", () => {
    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={createEmptyFolderContext({
          tree: createArticleTree({
            children: mixedFolderTree.children.filter((child) => child.kind !== "file"),
          }),
        })}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    expect(screen.getByText("No supported Markdown files found.")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "manual.pdf" })).toBeInTheDocument();
  });
});

const createEntryActions = (): ArticleNavigatorEntryActions => ({
  copyPath: vi.fn(),
  createEntry: vi.fn(async (): Promise<ArticleNavigatorEntryActionResult> => ({
    outcome: "cancelled",
  })),
  deleteEntry: vi.fn(),
  renameEntry: vi.fn(async (): Promise<ArticleNavigatorEntryActionResult> => ({
    outcome: "cancelled",
  })),
  revealEntry: vi.fn(),
});

const renderNavigatorWithActions = (actions = createEntryActions()) => ({
  actions,
  ...renderWithUser(
    <ArticleNavigator
      actions={actions}
      activeArticlePath={null}
      folderContext={nestedFolderContext}
      onOpenArticle={vi.fn()}
    />,
  ),
});

const getMenuItemNames = () =>
  screen.getAllByRole("menuitem").map((item) => item.textContent?.trim());

describe("article-navigator entry actions", () => {
  beforeEach(() => useArticleNavigatorStore.getState().reset());

  it("offers file actions on a file row", async () => {
    const { user } = renderNavigatorWithActions();

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "readme.md" }),
    });

    expect(await screen.findByRole("menu", { name: "File actions" })).toBeInTheDocument();
    expect(getMenuItemNames()).toEqual([
      "Open",
      "New file",
      "New folder",
      "Rename",
      "Open file location",
      "Copy path",
      "Copy relative path",
      "Delete",
    ]);
  });

  it("offers folder actions on a directory row", async () => {
    const { user } = renderNavigatorWithActions();

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "docs" }),
    });

    expect(await screen.findByRole("menu", { name: "Folder actions" })).toBeInTheDocument();
    expect(getMenuItemNames()).toEqual([
      "New file",
      "New folder",
      "Rename",
      "Open folder location",
      "Copy path",
      "Copy relative path",
      "Delete",
    ]);
  });

  it("offers location and path actions, but no open, rename, or delete, on an unsupported file", async () => {
    const actions = createEntryActions();
    const { user } = renderWithUser(
      <ArticleNavigator
        actions={actions}
        activeArticlePath={null}
        folderContext={mixedFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );
    const path = `${TEST_NOTES_FOLDER_PATH}/manual.pdf`;

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "manual.pdf" }),
    });

    expect(await screen.findByRole("menu", { name: "File actions" })).toBeInTheDocument();
    expect(getMenuItemNames()).toEqual([
      "New file",
      "New folder",
      "Open file location",
      "Copy path",
      "Copy relative path",
    ]);

    await user.click(screen.getByRole("menuitem", { name: "Open file location" }));

    expect(actions.revealEntry).toHaveBeenCalledWith(path);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "manual.pdf" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "New file" }));

    expect(screen.getByRole("treeitem", { name: "New file" })).toHaveAttribute("aria-level", "1");
  });

  it("opens the focused row's menu from the keyboard and returns focus on Escape", async () => {
    const { user } = renderNavigatorWithActions();
    const docsRow = screen.getByRole("treeitem", { name: "docs" });

    docsRow.focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");

    expect(await screen.findByRole("menu", { name: "Folder actions" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(docsRow).toHaveFocus());

    screen.getByRole("treeitem", { name: "readme.md" }).focus();
    await user.keyboard("{ContextMenu}");

    expect(await screen.findByRole("menu", { name: "File actions" })).toBeInTheDocument();
  });

  it("offers folder context actions on empty navigator space", async () => {
    const { actions, user } = renderNavigatorWithActions();

    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("tree") });
    await screen.findByRole("menu", { name: "Folder context actions" });

    expect(getMenuItemNames()).toEqual([
      "New file",
      "New folder",
      "Open folder location",
      "Copy path",
      "Copy relative path",
    ]);

    await user.click(screen.getByRole("menuitem", { name: "Copy relative path" }));

    expect(actions.copyPath).toHaveBeenCalledWith(".");
  });

  it("targets the invoked row for location, path, and delete actions", async () => {
    const { actions, user } = renderNavigatorWithActions();
    const openMenuOn = async (name: string) => {
      await user.pointer({
        keys: "[MouseRight]",
        target: screen.getByRole("treeitem", { name }),
      });
      await screen.findByRole("menu");
    };

    await user.click(screen.getByRole("treeitem", { name: "docs" }));
    await openMenuOn("spec.md");
    await user.click(screen.getByRole("menuitem", { name: "Copy relative path" }));
    await openMenuOn("spec.md");
    await user.click(screen.getByRole("menuitem", { name: "Copy path" }));
    await openMenuOn("docs");
    await user.click(screen.getByRole("menuitem", { name: "Open folder location" }));
    await openMenuOn("empty");
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(actions.copyPath).toHaveBeenNthCalledWith(1, "docs/spec.md");
    expect(actions.copyPath).toHaveBeenNthCalledWith(2, `${TEST_NESTED_DIRECTORY_PATH}/spec.md`);
    expect(actions.revealEntry).toHaveBeenCalledWith(TEST_NESTED_DIRECTORY_PATH);
    expect(actions.deleteEntry).toHaveBeenCalledWith("C:/Notes/empty", "directory");
  });

  it("renames a row inline and commits on Enter", async () => {
    const actions = createEntryActions();
    vi.mocked(actions.renameEntry).mockResolvedValue({
      outcome: "applied",
      path: "C:/Notes/intro.md",
    });
    const { user } = renderNavigatorWithActions(actions);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "readme.md" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const input = await screen.findByRole<HTMLInputElement>("textbox", { name: "File name" });

    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveValue("readme.md");
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, "readme".length]);

    await user.keyboard("intro{Enter}");

    expect(actions.renameEntry).toHaveBeenCalledWith("C:/Notes/readme.md", "intro.md");
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "File name" })).not.toBeInTheDocument(),
    );
    expect(useArticleNavigatorStore.getState().focusPath).toBe("C:/Notes/intro.md");
  });

  it("cancels an inline rename on Escape without renaming", async () => {
    const { actions, user } = renderNavigatorWithActions();

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "docs" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    await user.keyboard("guides{Escape}");

    expect(actions.renameEntry).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Folder name" })).not.toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "docs" })).toBeInTheDocument();
  });

  it("keeps editing after a refused rename on Enter", async () => {
    const actions = createEntryActions();
    vi.mocked(actions.renameEntry).mockResolvedValue({ outcome: "failed" });
    const { user } = renderNavigatorWithActions(actions);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "readme.md" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    await user.keyboard("draft{Enter}");

    await waitFor(() => expect(actions.renameEntry).toHaveBeenCalledOnce());
    expect(screen.getByRole("textbox", { name: "File name" })).toHaveValue("draft.md");
  });

  it("creates a file beside a file row and a folder inside a directory row", async () => {
    const actions = createEntryActions();
    vi.mocked(actions.createEntry).mockResolvedValue({
      outcome: "applied",
      path: `${TEST_NESTED_DIRECTORY_PATH}/guides`,
    });
    const { user } = renderNavigatorWithActions(actions);

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "readme.md" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "New file" }));

    expect(screen.getByRole("treeitem", { name: "New file" })).toHaveAttribute("aria-level", "1");

    await user.keyboard("{Escape}");
    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "docs" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "New folder" }));

    expect(screen.getByRole("treeitem", { name: "New folder" })).toHaveAttribute("aria-level", "2");

    await user.keyboard("guides{Enter}");

    expect(actions.createEntry).toHaveBeenCalledOnce();
    expect(actions.createEntry).toHaveBeenCalledWith(
      TEST_NESTED_DIRECTORY_PATH,
      "directory",
      "guides",
    );
  });

  it("focuses a created folder once the refreshed tree holds it", async () => {
    const createdPath = `${TEST_NESTED_DIRECTORY_PATH}/archive`;
    const refreshedFolderContext = createFolderContext({
      tree: createNestedArticleTree({
        children: createNestedArticleTree().children.map((child) =>
          child.kind === "directory" && child.path === TEST_NESTED_DIRECTORY_PATH
            ? {
                ...child,
                children: [
                  { kind: "directory", name: "archive", path: createdPath, children: [] },
                  ...child.children,
                ],
              }
            : child,
        ),
      }),
    });
    const actions = createEntryActions();
    const { rerender, user } = renderNavigatorWithActions(actions);
    vi.mocked(actions.createEntry).mockImplementation(async () => {
      rerender(
        <ArticleNavigator
          actions={actions}
          activeArticlePath={null}
          folderContext={refreshedFolderContext}
          onOpenArticle={vi.fn()}
        />,
      );

      return { outcome: "applied", path: createdPath };
    });

    await user.pointer({
      keys: "[MouseRight]",
      target: screen.getByRole("treeitem", { name: "docs" }),
    });
    await user.click(await screen.findByRole("menuitem", { name: "New folder" }));
    await user.keyboard("archive{Enter}");

    await waitFor(() => expect(screen.getByRole("treeitem", { name: "archive" })).toHaveFocus());
  });

  it("keeps editing when the window loses focus", async () => {
    const { actions, user } = renderNavigatorWithActions();

    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("tree") });
    await user.click(await screen.findByRole("menuitem", { name: "New file" }));
    await user.keyboard("notes");

    const input = screen.getByRole("textbox", { name: "File name" });
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);

    act(() => input.blur());
    hasFocus.mockRestore();

    expect(actions.createEntry).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "File name" })).toHaveValue("notes");
  });

  it("commits a pending name when the editor loses focus", async () => {
    const { actions, user } = renderNavigatorWithActions();

    await user.pointer({ keys: "[MouseRight]", target: screen.getByRole("tree") });
    await user.click(await screen.findByRole("menuitem", { name: "New file" }));
    await user.keyboard("notes");
    await user.click(screen.getByRole("textbox", { name: "Filter articles" }));

    expect(actions.createEntry).toHaveBeenCalledWith("C:/Notes", "file", "notes");
  });
});

describe("article-navigator icons", () => {
  beforeEach(() => useArticleNavigatorStore.getState().reset());

  const iconFolderContext = createFolderContext({
    tree: createArticleTree({
      children: [
        {
          kind: "directory",
          name: "assets",
          path: `${TEST_NOTES_FOLDER_PATH}/assets`,
          children: [
            {
              kind: "unsupportedFile",
              name: "cover.png",
              path: `${TEST_NOTES_FOLDER_PATH}/assets/cover.png`,
            },
          ],
        },
        {
          kind: "directory",
          name: "archive",
          path: `${TEST_NOTES_FOLDER_PATH}/archive`,
          children: [
            {
              kind: "unsupportedFile",
              name: "old.zip",
              path: `${TEST_NOTES_FOLDER_PATH}/archive/old.zip`,
            },
          ],
        },
        { kind: "unsupportedFile", name: "LICENSE", path: `${TEST_NOTES_FOLDER_PATH}/LICENSE` },
        {
          kind: "unsupportedFile",
          name: "MANUAL.PDF",
          path: `${TEST_NOTES_FOLDER_PATH}/MANUAL.PDF`,
        },
        { kind: "file", name: "readme.md", path: TEST_MARKDOWN_FILE_PATH },
      ],
    }),
  });

  const getRowIcon = (name: string) =>
    screen.getByRole("treeitem", { name }).querySelector<SVGElement>("svg[data-entry-icon]");

  it("draws folders open or closed and each file with its type's icon", () => {
    useArticleNavigatorStore.getState().expandDirectories([`${TEST_NOTES_FOLDER_PATH}/assets`]);

    render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={iconFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    expect(
      Object.fromEntries(
        ["assets", "cover.png", "archive", "LICENSE", "MANUAL.PDF", "readme.md"].map((name) => [
          name,
          getRowIcon(name)?.dataset.entryIcon,
        ]),
      ),
    ).toEqual({
      assets: "open-folder",
      "cover.png": "image",
      archive: "folder",
      LICENSE: "other",
      "MANUAL.PDF": "pdf",
      "readme.md": "article",
    });
    expect(getRowIcon("readme.md")).toHaveAttribute("aria-hidden", "true");
  });

  it("gives file types colors of their own only in the colored style", () => {
    const { rerender } = render(
      <ArticleNavigator
        activeArticlePath={null}
        folderContext={iconFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    expect(getRowIcon("MANUAL.PDF")?.getAttribute("class")).toBe(
      getRowIcon("LICENSE")?.getAttribute("class"),
    );
    expect(getRowIcon("readme.md")?.getAttribute("class")).not.toBe(
      getRowIcon("LICENSE")?.getAttribute("class"),
    );

    rerender(
      <ArticleNavigator
        activeArticlePath={null}
        fileIconStyle="colored"
        folderContext={iconFolderContext}
        onOpenArticle={vi.fn()}
        showAllFiles
      />,
    );

    expect(getRowIcon("MANUAL.PDF")?.getAttribute("class")).not.toBe(
      getRowIcon("LICENSE")?.getAttribute("class"),
    );
  });
});
