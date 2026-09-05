// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorDomElement } from "@/test/utils/prosemirror";
import { waitFor } from "@/test/utils/react";

const mountStyledEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});
const editorCssPath = resolve(process.cwd(), "src/features/editor/components/milkdown-editor.css");

describe("Editor presentation", () => {
  it("renders supported editor blocks with styleable ProseMirror structure", async () => {
    const mounted = await mountStyledEditor(`# Heading

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

    expect(mounted.root).toHaveClass(EDITOR_TEST_ROOT_CLASS_NAME);
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
    expect(editorCss).toMatch(/table\s*\{[^}]*overflow-x-auto/su);
    expect(editorCss).toContain("overflow-x-auto");
    expect(editorCss).toContain('&[data-code-block-soft-wrap="true"]');
    expect(editorCss).toContain("whitespace-pre-wrap");
    expect(editorCss).toContain(".tableWrapper {");
    expect(editorCss).toContain("&[data-checked] {");
  });

  it("keeps raw HTML code-like styling targetable from the editor root", async () => {
    const mounted = await mountStyledEditor("<div>Block</div>");
    const htmlNode = getEditorDomElement(mounted, '[data-type="html"]');
    const editorCss = readFileSync(editorCssPath, "utf8");

    expect(mounted.getMarkdown()).toBe("<div>Block</div>\n");
    expect(htmlNode.closest(".leafdown-editor")).toBe(mounted.root);
    expect(editorCss).toContain('& [data-type="html"] {');
    expect(editorCss).toContain("font-mono");
    expect(editorCss).toContain("bg-muted");
    expect(editorCss).toContain("text-muted-foreground");
  });

  it("renders a footnote definition beside its persistent marker", async () => {
    const mounted = await mountStyledEditor("Note[^a]\n\n[^a]: Detail");
    const definition = getEditorDomElement(mounted, "dl[data-type='footnote_definition']");
    const editorCss = readFileSync(editorCssPath, "utf8");

    expect(definition).toHaveAttribute("data-leafdown-marker", "[^a]:");
    expect(definition.querySelector("dd")).toHaveTextContent("Detail");
    expect(editorCss).toContain(".leafdown-marker-node--persistent::before {");
    expect(editorCss).toMatch(
      /dl\[data-type="footnote_definition"\]\s*\{[^}]*flex items-baseline/su,
    );
  });

  it("adds bundled Shiki decorations to supported code block languages", async () => {
    const mounted = await mountStyledEditor(`\`\`\`ts
const value: number = 1;
\`\`\``);

    await waitFor(
      () => {
        expect(getEditorDomElement(mounted, ".shiki")).toBeInTheDocument();
      },
      { timeout: 10_000 },
    );

    const shikiToken = getEditorDomElement<HTMLElement>(mounted, ".shiki");

    expect(mounted.view.dom.querySelector("pre[data-language='ts']")).toHaveTextContent(
      "const value",
    );
    expect(shikiToken.getAttribute("style")).toContain("color");
  });

  it("keeps unknown code block languages editable without requiring remote assets", async () => {
    const mounted = await mountStyledEditor(`\`\`\`leafdown-unknown
value
\`\`\``);

    expect(
      mounted.view.dom.querySelector("pre[data-language='leafdown-unknown']"),
    ).toHaveTextContent("value");
    expect(mounted.getMarkdown()).toBe("```leafdown-unknown\nvalue\n```\n");
  });

  it("keeps code-block soft wrap as CSS-only presentation", async () => {
    const mounted = await mountStyledEditor(`\`\`\`ts
const value = 1;
\`\`\``);
    const markdown = mounted.getMarkdown();

    mounted.root.dataset.codeBlockSoftWrap = "true";

    expect(mounted.root).toHaveAttribute("data-code-block-soft-wrap", "true");
    expect(mounted.getMarkdown()).toBe(markdown);
  });
});
