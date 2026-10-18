// @vitest-environment happy-dom

import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it, vi } from "vitest";

import { withMacUserAgent, withWindowsUserAgent } from "@/test/utils/platform";
import { render, renderWithUser, screen, within } from "@/test/utils/react";

import { HelpMarkdown } from "./help-markdown";

describe("HelpMarkdown", () => {
  it("renders only bundled illustrations, with informative and decorative alternatives", () => {
    render(
      <HelpMarkdown
        source={
          "![Window legend](illustrations/window.svg)\n\n![](illustrations/tabs.svg)\n\n![Missing](illustrations/missing.svg)\n\n![Local](file:///private.svg)"
        }
      />,
    );
    expect(screen.getByRole("img", { name: "Window legend" }).querySelector("svg")).not.toBeNull();
    const article = screen.getByRole("article");
    expect(article.querySelectorAll("svg")).toHaveLength(2);
    expect(article.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
    expect(article.querySelector("img")).toBeNull();
    expect(article).toHaveTextContent("Missing");
    expect(article).toHaveTextContent("Local");
  });

  it("pairs explicit example fences with an inert result and keeps ordinary fences as code", () => {
    render(
      <HelpMarkdown
        source={
          "```markdown example=gfm\n- [x] Done\n```\n\n```markdown example=leafdown\n$a^2$\n```\n\n```markdown\n# Plain sample\n```\n\n```markdown example=unknown\nNo preview\n```"
        }
      />,
    );
    const article = screen.getByRole("article");
    expect(article.querySelectorAll("figure")).toHaveLength(2);
    expect(article.querySelectorAll("pre code")).toHaveLength(4);
    expect(article.querySelector('[data-help-example="gfm"]')).toHaveTextContent("What you type");
    expect(article.querySelector('[data-help-example="leafdown"]')).toHaveTextContent(
      "Leafdown extension",
    );
    expect(article.querySelectorAll("[inert][aria-hidden=true]")).toHaveLength(2);
    expect(article.querySelector("pre code")).toHaveTextContent("- [x] Done");
  });

  it("keeps navigation cards keyboard reachable and preserves ordinary lists and tips", async () => {
    const onPageLink = vi.fn();
    const { user } = renderWithUser(
      <HelpMarkdown
        onPageLink={onPageLink}
        source={
          "- [Read Markdown](markdown-reference.md) — Examples.\n- [Settings](settings-reference.md) — Choices.\n\n> **Tip:** Keep a copy.\n\n- Ordinary item"
        }
      />,
    );
    const link = screen.getByRole("button", { name: "Read Markdown" });
    link.focus();
    await user.keyboard("{Enter}");
    expect(onPageLink).toHaveBeenCalledWith("markdown-reference");
    expect(link.closest("ul")).toHaveClass("grid");
    expect(screen.getByText("Ordinary item").closest("ul")).toHaveClass("list-disc");
    expect(screen.getByText("Tip:").closest("blockquote")).toHaveTextContent("Keep a copy.");
  });

  it.each([
    ["Windows", withWindowsUserAgent, "Ctrl+Shift+F", ["Ctrl", "Shift", "F"]],
    ["macOS", withMacUserAgent, "Shift+Command+F", ["⇧", "⌘", "F"]],
  ] as const)(
    "renders inline keyboard notation on %s and preserves code",
    async (_, platform, name, labels) => {
      await platform(() => {
        render(
          <HelpMarkdown
            source={
              "Press `Mod+Shift+F`, `Enter`, or `Escape`. Keep `Table` and `src/file.ts`.\n\n```\nEnter\n```\n\n```text\nMod+Shift+F\n```"
            }
          />,
        );
        const article = screen.getByRole("article");
        const shortcut = within(article).getByText(name).closest("kbd")!;
        expect([...shortcut.querySelectorAll("kbd")].map((key) => key.textContent)).toEqual(labels);
        expect(article.querySelectorAll('[data-slot="shortcut-keys"]')).toHaveLength(3);
        expect(article.querySelectorAll("pre code")).toHaveLength(2);
        expect(article.querySelector("pre code")).toHaveTextContent("Enter");
        expect(within(article).getByText("Table", { selector: "code" })).toBeInTheDocument();
        expect(within(article).getByText("src/file.ts", { selector: "code" })).toBeInTheDocument();
      });
    },
  );

  it("shows pointer and arrow gestures with keycaps only around their modifier", () => {
    render(<HelpMarkdown source="Use `Mod+click` or `Shift+arrows`." />);
    const article = screen.getByRole("article");
    expect(article.querySelectorAll('[data-slot="keycap"]')).toHaveLength(2);
    expect(article).not.toHaveTextContent("Mod");
    expect(article).toHaveTextContent("+click");
    expect(article).toHaveTextContent("+arrows");
    expect(article.querySelector("code")).toBeNull();
  });

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
