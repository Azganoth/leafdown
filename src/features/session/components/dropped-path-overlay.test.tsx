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
