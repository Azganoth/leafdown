// @vitest-environment happy-dom

import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it } from "vitest";

import { render, screen, within } from "@/test/utils/react";

import { HelpMarkdown } from "./help-markdown";

describe("HelpMarkdown", () => {
  it("keeps bundled-page links as text when no page handler is given", () => {
    render(<HelpMarkdown source="See [Markdown reference](markdown-reference.md)." />);

    const article = screen.getByRole("article");
    expect(within(article).queryByRole("button")).toBeNull();
    expect(article).toHaveTextContent("See Markdown reference.");
  });

  it("renders leading content before the page and fourth-level headings below its sections", () => {
    render(
      <HelpMarkdown source={"### Section\n\n#### Detail\n\nText."}>
        <p>Lead</p>
      </HelpMarkdown>,
    );

    const article = screen.getByRole("article");
    expect(article.firstElementChild).toHaveTextContent("Lead");
    expect(within(article).getByRole("heading", { level: 4, name: "Section" })).toBeInTheDocument();
    expect(within(article).getByRole("heading", { level: 5, name: "Detail" })).toBeInTheDocument();
  });

  it("shows image descriptions and leaves raw HTML and credentialed links inert", () => {
    render(
      <HelpMarkdown
        source={
          "![Leaf diagram](https://example.com/leaf.png)\n\n<b>raw</b> [Sign in](https://user:secret@example.com/)"
        }
      />,
    );

    const article = screen.getByRole("article");
    expect(article.querySelector("img")).toBeNull();
    expect(article.querySelector("b")).toBeNull();
    expect(article).toHaveTextContent("Leaf diagram");
    expect(within(article).queryByRole("button")).toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
  });
});
