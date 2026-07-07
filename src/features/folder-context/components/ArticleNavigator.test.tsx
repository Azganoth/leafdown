import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmptyFolderContext, createFolderContext } from "@/test/factories/folderContext";
import { render, renderWithUser, screen } from "@/test/utils/react";

import { useArticleNavigatorStore } from "../stores/articleNavigator";
import { ArticleNavigator } from "./ArticleNavigator";

const folderContext = createFolderContext();

const emptyFolderContext = createEmptyFolderContext();

describe("ArticleNavigator", () => {
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

    await user.click(screen.getByRole("button", { name: "readme.md" }));

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

    await user.click(screen.getByRole("button", { name: "readme.md" }));

    expect(onOpenArticle).not.toHaveBeenCalled();
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
});
