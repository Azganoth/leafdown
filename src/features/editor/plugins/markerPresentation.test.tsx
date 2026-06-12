import { fireEvent, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection } from "@milkdown/kit/prose/state";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const mountEditorWithImageContext = async (
  initialMarkdown: string,
): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, {
    documentPath: "C:/Notes/readme.md",
    folderContextPath: "C:/Notes",
    rootClassName: "leafdown-editor",
  });
  mountedEditors.push(mounted);
  return mounted;
};

const getNodePosition = (
  mounted: MountedMilkdownEditor,
  typeName: string,
  predicate: (node: ProseMirrorNode) => boolean = () => true,
) => {
  let position: number | null = null;

  mounted.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName || !predicate(node)) {
      return true;
    }

    position = pos;
    return false;
  });

  if (position === null) {
    throw new Error(`Could not find ${typeName} node.`);
  }

  return position;
};

describe("marker presentation", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("shows subtle heading markers only for collapsed caret context", async () => {
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

  it("keeps detached inline Markdown source editing for non-projected inline marks", async () => {
    const mounted = await mountEditor("`Code` plain");
    const code = mounted.view.dom.querySelector("code");

    expect(code).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, code as HTMLElement);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(
      ".leafdown-source-edit[aria-label='Inline Markdown']",
    );

    expect(input).toHaveValue("`Code`");

    fireEvent.input(input as HTMLInputElement, { target: { value: "`Updated`" } });
    fireEvent.keyDown(input as HTMLInputElement, { key: "Enter" });
    fireEvent.blur(input as HTMLInputElement);

    await waitFor(() => {
      expect(mounted.getMarkdown()).toBe("`Updated` plain\n");
    });
  });

  it("does not add caret markers to blockquotes or list items", async () => {
    const mounted = await mountEditor(`> Quote

3. Ordered

- Bullet

- [ ] Todo`);
    const blockquote = mounted.view.dom.querySelector("blockquote");
    const orderedListItem = mounted.view.dom.querySelector("ol li");
    const unorderedListItem = mounted.view.dom.querySelector("ul li:not([data-checked])");
    const taskListItem = mounted.view.dom.querySelector("li[data-checked='false']");

    expect(blockquote).toBeInTheDocument();
    expect(orderedListItem).toBeInTheDocument();
    expect(unorderedListItem).toBeInTheDocument();
    expect(taskListItem).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, blockquote as HTMLElement);

    expect(blockquote).not.toHaveClass("leafdown-marker-node--subtle");
    expect(blockquote).not.toHaveAttribute("data-leafdown-marker");

    setSelectionAtTextEnd(mounted.view, orderedListItem as HTMLElement);

    expect(orderedListItem).not.toHaveClass("leafdown-marker-node--subtle");
    expect(orderedListItem).not.toHaveAttribute("data-leafdown-marker");

    setSelectionAtTextEnd(mounted.view, unorderedListItem as HTMLElement);

    expect(unorderedListItem).not.toHaveClass("leafdown-marker-node--subtle");
    expect(unorderedListItem).not.toHaveAttribute("data-leafdown-marker");

    setSelectionAtTextEnd(mounted.view, taskListItem as HTMLElement);

    expect(taskListItem).not.toHaveClass("leafdown-marker-node--subtle");
    expect(taskListItem).not.toHaveAttribute("data-leafdown-marker");
  });

  it("exposes autolinks as editable raw Markdown source", async () => {
    const mounted = await mountEditor("<https://example.com>");
    const link = mounted.view.dom.querySelector("a");

    expect(link).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, link as HTMLElement);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(
      ".leafdown-source-edit[aria-label='Inline Markdown']",
    );

    expect(input).toHaveValue("<https://example.com>");

    fireEvent.input(input as HTMLInputElement, {
      target: { value: "<https://leafdown.dev>" },
    });
    fireEvent.keyDown(input as HTMLInputElement, { key: "Enter" });

    await waitFor(() => {
      expect(mounted.getMarkdown()).toBe("<https://leafdown.dev>\n");
    });
  });

  it("exposes footnote references as editable raw Markdown source", async () => {
    const mounted = await mountEditor("Text[^note]\n\n[^note]: Detail");
    const footnoteReferencePos = getNodePosition(mounted, "footnote_reference");

    setTextSelection(mounted.view, footnoteReferencePos);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(
      ".leafdown-source-edit[aria-label='Markdown source']",
    );

    expect(input).toHaveValue("[^note]");

    fireEvent.input(input as HTMLInputElement, { target: { value: "[^updated]" } });
    fireEvent.keyDown(input as HTMLInputElement, { key: "Enter" });

    await waitFor(() => {
      expect(mounted.getMarkdown()).toContain("Text[^updated]");
    });
  });

  it("exposes raw HTML as editable raw Markdown source", async () => {
    const mounted = await mountEditor("<span>HTML</span>");
    const htmlPos = getNodePosition(mounted, "html", (node) =>
      String(node.attrs.value).startsWith("<span"),
    );

    setTextSelection(mounted.view, htmlPos);

    const input = mounted.view.dom.querySelector<HTMLInputElement>(
      ".leafdown-source-edit[aria-label='Markdown source']",
    );

    expect(input).toHaveValue("<span>");

    fireEvent.input(input as HTMLInputElement, { target: { value: "<mark>" } });
    fireEvent.keyDown(input as HTMLInputElement, { key: "Enter" });

    await waitFor(() => {
      expect(mounted.getMarkdown()).toContain("<mark>HTML</span>");
    });
  });

  it("keeps image focus exposing editable raw Markdown", async () => {
    vi.mocked(invoke).mockResolvedValue({
      kind: "renderable",
      path: "C:\\Notes\\assets\\icon.png",
    });

    const mounted = await mountEditorWithImageContext("![Alt](./assets/icon.png)");

    await waitFor(() => {
      expect(mounted.view.dom.querySelector("img[alt='Alt']")).toBeInTheDocument();
    });

    fireEvent.mouseDown(mounted.view.dom.querySelector<HTMLImageElement>("img[alt='Alt']")!);

    expect(mounted.view.dom.querySelector(".leafdown-image-markdown-input")).toHaveValue(
      "![Alt](./assets/icon.png)",
    );
  });

  it("keeps code blocks visual without MVP language controls", async () => {
    const mounted = await mountEditor(`\`\`\`ts
const value = 1;
\`\`\``);
    const code = mounted.view.dom.querySelector("pre code");

    expect(code).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, code as HTMLElement);

    expect(mounted.view.dom.querySelector("pre")).toHaveTextContent("const value = 1;");
    expect(mounted.view.dom.querySelector(".leafdown-code-language-input")).not.toBeInTheDocument();
    expect(mounted.view.dom).not.toHaveTextContent("```");
  });

  it("keeps tables and horizontal rules rendered without marker affordances", async () => {
    const mounted = await mountEditor(`First

---

| A | B |
| - | - |
| C | D |`);
    const horizontalRule = mounted.view.dom.querySelector("hr");

    expect(horizontalRule).toBeInTheDocument();
    expect(mounted.view.dom.querySelector("table")).toHaveTextContent("CD");
    expect(mounted.view.dom).not.toHaveTextContent("---");

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

    expect(mounted.view.dom.querySelector("hr")).not.toHaveClass("leafdown-visual-object--active");
    expect(mounted.view.dom.querySelector("table")).not.toHaveClass(
      "leafdown-visual-object--active",
    );
  });
});
