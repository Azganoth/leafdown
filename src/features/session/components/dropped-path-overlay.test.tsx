// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils/react";

import { DroppedPathOverlay } from "./dropped-path-overlay";

describe("DroppedPathOverlay", () => {
  it("describes the configured action and dropped item", () => {
    render(
      <DroppedPathOverlay
        indicator={{
          action: "insertMarkdownFileLink",
          droppedPath: { kind: "markdownFile", path: "C:/Notes/guide.md" },
          status: "ready",
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Insert file link");
    expect(screen.getByRole("status")).toHaveTextContent("guide.md");
  });

  it("draws the folder or Markdown file it opens with the article navigator's icon", () => {
    const { rerender } = render(
      <DroppedPathOverlay
        indicator={{
          action: "openFolder",
          droppedPath: { kind: "folder", path: "C:/Notes" },
          status: "ready",
        }}
      />,
    );

    const getIcon = () => screen.getByRole("status").querySelector("svg[data-entry-icon]");

    expect(getIcon()).toHaveAttribute("data-entry-icon", "open-folder");
    expect(getIcon()).toHaveAttribute("aria-hidden", "true");

    rerender(
      <DroppedPathOverlay
        indicator={{
          action: "openMarkdownFile",
          droppedPath: { kind: "markdownFile", path: "C:/Notes/guide.md" },
          status: "ready",
        }}
      />,
    );

    expect(getIcon()).toHaveAttribute("data-entry-icon", "article");
  });

  it("explains why a drop is unavailable", () => {
    render(
      <DroppedPathOverlay indicator={{ count: 3, reason: "multipleItems", status: "rejected" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Drop one item at a time");
    expect(screen.getByRole("status")).toHaveTextContent("3 items selected");
  });

  it("does not render outside an active drag", () => {
    render(<DroppedPathOverlay indicator={null} />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
