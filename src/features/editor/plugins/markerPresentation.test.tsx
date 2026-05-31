import { fireEvent, waitFor } from "@testing-library/react";
import { NodeSelection } from "@milkdown/kit/prose/state";
import { afterEach, describe, expect, it } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { setSelectionAtTextEnd, setTextSelection } from "@/test/utils/prosemirror";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, {
    rootClassName: "leafdown-editor",
  });
  mountedEditors.push(mounted);
  return mounted;
};

describe("marker presentation", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("shows subtle block markers only for collapsed caret context", async () => {
    const mounted = await mountEditor("# Heading");
    const heading = mounted.view.dom.querySelector("h1");

    expect(heading).toBeInTheDocument();

    const position = setSelectionAtTextEnd(mounted.view, heading as HTMLHeadingElement);

    expect(heading).toHaveClass("leafdown-marker-node--subtle");
    expect(heading).toHaveAttribute("data-leafdown-marker", "H1");

    setTextSelection(mounted.view, Math.max(1, position - 3), position);

    expect(heading).not.toHaveClass("leafdown-marker-node--subtle");
    expect(heading).not.toHaveAttribute("data-leafdown-marker");
  });

  it("keeps footnote definition markers persistent", async () => {
    const mounted = await mountEditor("Text[^note]\n\n[^note]: Detail");

    expect(mounted.view.dom.querySelector(".leafdown-marker-widget--persistent")).toHaveTextContent(
      "[^note]:",
    );

    setTextSelection(mounted.view, 1, 5);

    expect(mounted.view.dom.querySelector(".leafdown-marker-widget--persistent")).toHaveTextContent(
      "[^note]:",
    );
  });

  it("exposes active inline Markdown source for editing", async () => {
    const mounted = await mountEditor("**Bold** plain");
    const strong = mounted.view.dom.querySelector("strong");

    expect(strong).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, strong as HTMLElement);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(
      ".leafdown-source-edit[aria-label='Inline Markdown']",
    );

    expect(input).toHaveValue("**Bold**");

    fireEvent.input(input as HTMLInputElement, { target: { value: "**Updated**" } });
    fireEvent.keyDown(input as HTMLInputElement, { key: "Enter" });

    await waitFor(() => {
      expect(mounted.getMarkdown()).toContain("**Updated** plain");
    });
  });

  it("keeps code blocks visual while exposing language metadata control", async () => {
    const mounted = await mountEditor(`\`\`\`ts
const value = 1;
\`\`\``);
    const code = mounted.view.dom.querySelector("pre code");

    expect(code).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, code as HTMLElement);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(".leafdown-code-language-input");

    expect(input).toHaveValue("ts");
    expect(mounted.view.dom.querySelector("pre")).toHaveTextContent("const value = 1;");

    fireEvent.input(input as HTMLInputElement, { target: { value: "rust" } });
    fireEvent.keyDown(input as HTMLInputElement, { key: "Enter" });

    await waitFor(() => {
      expect(mounted.getMarkdown()).toBe("```rust\nconst value = 1;\n```\n");
    });
  });

  it("marks tables and horizontal rules as visual objects instead of raw delimiters", async () => {
    const mounted = await mountEditor(`First

---

| A | B |
| - | - |
| C | D |`);
    const horizontalRule = mounted.view.dom.querySelector("hr");

    expect(horizontalRule).toBeInTheDocument();

    const horizontalRulePos = (() => {
      let position: number | null = null;

      mounted.view.state.doc.descendants((node, pos) => {
        if (node.type.name !== "hr") {
          return true;
        }

        position = pos;
        return false;
      });

      if (position === null) {
        throw new Error("Could not find horizontal rule node.");
      }

      return position;
    })();

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        NodeSelection.create(mounted.view.state.doc, horizontalRulePos),
      ),
    );

    expect(mounted.view.dom.querySelector("hr")).toHaveClass("leafdown-visual-object--active");
    expect(mounted.view.dom).not.toHaveTextContent("---");
    expect(mounted.view.dom.querySelector("table")).toHaveTextContent("CD");
  });
});
