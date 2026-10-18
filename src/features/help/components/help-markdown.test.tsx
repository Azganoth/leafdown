// @vitest-environment happy-dom

import { openUrl } from "@tauri-apps/plugin-opener";
import { describe, expect, it } from "vitest";

import { withMacUserAgent, withWindowsUserAgent } from "@/test/utils/platform";
import { render, screen, within } from "@/test/utils/react";

import { HelpMarkdown } from "./help-markdown";

describe("HelpMarkdown", () => {
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
