// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorDomElement, setTextSelection } from "@/test/utils/prosemirror";
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
    expect(dom.querySelector(".tableWrapper > table")).toHaveTextContent("Leafdown");

    expect(editorCss).toContain(".leafdown-editor {");
    expect(editorCss).toContain(".ProseMirror {");
    expect(editorCss).toMatch(/\.tableWrapper\s*\{[^}]*overflow-x-auto/su);
    expect(editorCss).toContain("overflow-x-auto");
    expect(editorCss).toContain('&[data-code-block-soft-wrap="true"]');
    expect(editorCss).toContain("whitespace-pre-wrap");
    expect(editorCss).toContain(".tableWrapper {");
    expect(editorCss).toContain("&[data-checked] {");
  });

  it("draws unsupported raw HTML as layout-neutral muted text", async () => {
    const mounted = await mountStyledEditor('<div class="note">Block</div>');
    const htmlNode = getEditorDomElement(mounted, '[data-type="html"]');
    const editorCss = readFileSync(editorCssPath, "utf8");
    const htmlFallbackRule = editorCss.match(
      /& \[data-type="html"\]\[data-html-rendered="false"\] \{(?<body>[^}]*)\}/su,
    )?.groups?.body;

    expect(mounted.getMarkdown()).toBe('<div class="note">Block</div>\n');
    expect(htmlNode).toHaveAttribute("data-html-rendered", "false");
    expect(htmlNode.closest(".leafdown-editor")).toBe(mounted.root);
    expect(htmlFallbackRule).toContain("text-muted-foreground");
    expect(htmlFallbackRule).not.toMatch(/bg-|font-mono|p[xy]-|text-\[/u);
  });

  it("uses ordinary HTML whitespace and block flow for rendered block roots", async () => {
    const mounted = await mountStyledEditor(`<section>
Multiline safe HTML.
</section>`);
    const htmlNode = getEditorDomElement(mounted, '[data-type="html"]');
    const editorCss = readFileSync(editorCssPath, "utf8");

    expect(htmlNode).toHaveAttribute("data-html-rendered", "true");
    expect(htmlNode).toHaveAttribute("data-html-flow", "block");
    expect(htmlNode.querySelector("section")).toHaveTextContent("Multiline safe HTML.");
    expect(editorCss).toMatch(/\[data-html-rendered="true"\]\s*\{[^}]*white-space: normal/su);
    expect(editorCss).toMatch(/\[data-html-flow="block"\]\s*\{[^}]*display: block/su);
  });

  it("paints a neutral padded wash without changing selectable-block geometry", () => {
    const editorCss = readFileSync(editorCssPath, "utf8");
    const selectedBlockRule = editorCss.match(
      /\.leafdown-selected-block,\s*hr\.ProseMirror-selectednode\s*\{(?<body>[^}]*)\}/su,
    )?.groups?.body;

    expect(editorCss).not.toMatch(/\.leafdown-selectable-block\s*\{/u);
    expect(selectedBlockRule).toContain("rounded-sm");
    expect(selectedBlockRule).toContain("var(--foreground) 5%");
    expect(selectedBlockRule).toContain("background-image: linear-gradient");
    expect(selectedBlockRule).toContain("box-shadow: 0 0 0 0.25rem");
    expect(selectedBlockRule).not.toMatch(/padding|margin|border|outline|primary/u);
    expect(editorCss).toMatch(/hr\.ProseMirror-selectednode\s*\{[^}]*outline-none/su);
  });

  it("renders a footnote definition's label beside its marker runs", async () => {
    const mounted = await mountStyledEditor("Note[^a]\n\n[^a]: Detail");
    const definition = getEditorDomElement(mounted, "dl[data-type='footnote_definition']");
    const label = getEditorDomElement(mounted, "dl[data-type='footnote_definition'] > dt");
    const editorCss = readFileSync(editorCssPath, "utf8");

    expect(label).toHaveTextContent(/^a$/u);
    expect(definition).not.toHaveAttribute("data-leafdown-marker");
    expect(definition.querySelector("p")).toHaveTextContent("Detail");
    expect(editorCss).toMatch(
      /dl\[data-type="footnote_definition"\]\s*\{[^}]*grid items-baseline/su,
    );
    expect(editorCss).toMatch(
      /dl\[data-type="footnote_definition"\]\s*>\s*dt\s*\{.*?content:\s*"\[\^";.*?content:\s*"\]:";/su,
    );
  });

  it("draws the character a projected reference names beside its source", async () => {
    const mounted = await mountStyledEditor("A &copy; b");
    const editorCss = readFileSync(editorCssPath, "utf8");

    setTextSelection(mounted.view, 3);

    const preview = getEditorDomElement(mounted, "[data-leafdown-preview]");

    expect(preview).toHaveAttribute("data-leafdown-preview", "©");
    expect(preview).toHaveTextContent("");
    expect(preview.nextSibling).toHaveTextContent("&copy;");
    expect(editorCss).toContain(".leafdown-source-projection__preview::before {");
    expect(editorCss).toMatch(
      /\.leafdown-source-projection__preview::before\s*\{[^}]*content: attr\(data-leafdown-preview\)/su,
    );
  });

  it("adds bundled Shiki decorations carrying a colour for each appearance", async () => {
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
    const editorCss = readFileSync(editorCssPath, "utf8");

    expect(mounted.view.dom.querySelector("pre[data-language='ts']")).toHaveTextContent(
      "const value",
    );
    expect(shikiToken.getAttribute("style")).toContain("--shiki-light:");
    expect(shikiToken.getAttribute("style")).toContain("--shiki-dark:");
    expect(shikiToken.getAttribute("style")).not.toMatch(/(?:^|;)\s*color:/u);
    expect(editorCss).toMatch(/\.shiki\s*\{[^}]*color: var\(--shiki-light\)/su);
    expect(editorCss).toMatch(/&:is\(\.dark \*\)\s*\{[^}]*color: var\(--shiki-dark\)/su);
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
