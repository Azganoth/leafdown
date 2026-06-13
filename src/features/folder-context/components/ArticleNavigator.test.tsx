import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithUser, screen } from "@/test/utils/react";
import { useArticleNavigatorStore } from "../stores/articleNavigator";
import { ArticleNavigator } from "./ArticleNavigator";

const folderContext = {
  path: "C:/Notes",
  isEmpty: false,
  tree: {
    name: "Notes",
    path: "C:/Notes",
    children: [{ kind: "file" as const, name: "readme.md", path: "C:/Notes/readme.md" }],
  },
};

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
});
