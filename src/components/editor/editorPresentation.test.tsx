import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

const mountedEditors: MountedMilkdownEditor[] = [];
const editorCssPath = resolve(process.cwd(), "src/components/editor/MilkdownEditor.css");

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, {
    rootClassName: "leafdown-editor",
  });
  mountedEditors.push(mounted);
  return mounted;
};

describe("Editor presentation", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("renders supported editor blocks with styleable ProseMirror structure", async () => {
    const mounted = await mountEditor(`# Heading

Paragraph with \`inline code\`.

> Quote

- [x] Done

---

\`\`\`typescript
const value = 1;
\`\`\`

| Name | Role |
| - | - |
| Leafdown | Editor |
`);
    const { dom } = mounted.view;
    const editorCss = readFileSync(editorCssPath, "utf8");

    expect(mounted.root).toHaveClass("leafdown-editor");
    expect(dom.querySelector("h1")).toHaveTextContent("Heading");
    expect(dom.querySelector("p")).toHaveTextContent("Paragraph");
    expect(dom.querySelector("blockquote")).toHaveTextContent("Quote");
    expect(dom.querySelector("li[data-checked='true']")).toHaveTextContent("Done");
    expect(dom.querySelector("hr")).toBeInTheDocument();
    expect(dom.querySelector("pre[data-language='typescript']")).toHaveTextContent(
      "const value = 1;",
    );
    expect(dom.querySelector("table")).toHaveTextContent("Leafdown");

    expect(editorCss).toContain(".leafdown-editor {");
    expect(editorCss).toContain(".ProseMirror {");
    expect(editorCss).toMatch(/table\s*\{[^}]*overflow-x-auto/s);
    expect(editorCss).toContain("overflow-x-auto");
    expect(editorCss).toContain('&[data-code-block-soft-wrap="true"]');
    expect(editorCss).toContain("whitespace-pre-wrap");
    expect(editorCss).toContain(".tableWrapper {");
    expect(editorCss).toContain("&[data-checked] {");
  });

  it("adds bundled Shiki decorations to supported code block languages", async () => {
    const mounted = await mountEditor(`\`\`\`ts
const value: number = 1;
\`\`\``);

    await waitFor(
      () => {
        expect(mounted.view.dom.querySelector(".shiki")).toBeInTheDocument();
      },
      { timeout: 10_000 },
    );

    const shikiToken = mounted.view.dom.querySelector<HTMLElement>(".shiki");

    expect(mounted.view.dom.querySelector("pre[data-language='ts']")).toHaveTextContent(
      "const value",
    );
    expect(shikiToken?.getAttribute("style")).toContain("color");
  });

  it("keeps unknown code block languages editable without requiring remote assets", async () => {
    const mounted = await mountEditor(`\`\`\`leafdown-unknown
value
\`\`\``);

    expect(
      mounted.view.dom.querySelector("pre[data-language='leafdown-unknown']"),
    ).toHaveTextContent("value");
    expect(mounted.getMarkdown()).toBe("```leafdown-unknown\nvalue\n```\n");
  });

  it("keeps code-block soft wrap as CSS-only presentation", async () => {
    const mounted = await mountEditor(`\`\`\`ts
const value = 1;
\`\`\``);
    const markdown = mounted.getMarkdown();

    mounted.root.dataset.codeBlockSoftWrap = "true";

    expect(mounted.root).toHaveAttribute("data-code-block-soft-wrap", "true");
    expect(mounted.getMarkdown()).toBe(markdown);
  });
});
