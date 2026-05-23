import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MilkdownEditor } from "@/components/editor";
import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { render, screen } from "@/test/utils/react";

const executionFlag = "__leafdownHtmlExecuted";
const mountedEditors: MountedMilkdownEditor[] = [];
const editorCssPath = resolve(process.cwd(), "src/components/editor/MilkdownEditor.css");

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, {
    rootClassName: "leafdown-editor",
  });
  mountedEditors.push(mounted);
  return mounted;
};

const getExecutionFlag = (): unknown =>
  (window as unknown as Record<string, unknown>)[executionFlag];

const resetExecutionFlag = () => {
  (window as unknown as Record<string, unknown>)[executionFlag] = false;
};

describe("HTML safety", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
    delete (window as unknown as Record<string, unknown>)[executionFlag];
  });

  it("renders block and inline HTML as text-only Milkdown HTML atoms", async () => {
    resetExecutionFlag();

    const markdown = `<div onclick="window.${executionFlag} = true">Block</div>

Inline <span onmouseover="window.${executionFlag} = true">HTML</span> text.`;
    const mounted = await mountEditor(markdown);
    const { dom } = mounted.view;
    const htmlNodes = Array.from(dom.querySelectorAll<HTMLElement>('[data-type="html"]'));

    expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
    expect(htmlNodes.length).toBeGreaterThanOrEqual(3);
    expect(htmlNodes.map((node) => node.dataset.value)).toEqual(
      expect.arrayContaining([
        `<div onclick="window.${executionFlag} = true">Block</div>`,
        `<span onmouseover="window.${executionFlag} = true">`,
        "</span>",
      ]),
    );
    expect(dom).toHaveTextContent(`<div onclick="window.${executionFlag} = true">`);
    expect(dom).toHaveTextContent(`<span onmouseover="window.${executionFlag} = true">`);
    expect(dom.querySelector("div[onclick]")).not.toBeInTheDocument();
    expect(dom.querySelector("span[onmouseover]")).not.toBeInTheDocument();
    expect(getExecutionFlag()).toBe(false);
  });

  it("does not create live script or event-handler DOM from raw HTML", async () => {
    resetExecutionFlag();

    const markdown = `<script>window.${executionFlag} = true</script>

<img src=x onerror="window.${executionFlag} = true">`;
    const mounted = await mountEditor(markdown);
    const { dom } = mounted.view;

    expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
    expect(dom).toHaveTextContent(`<script>window.${executionFlag} = true</script>`);
    expect(dom).toHaveTextContent(`<img src=x onerror="window.${executionFlag} = true">`);
    expect(dom.querySelector("script")).not.toBeInTheDocument();
    expect(dom.querySelector(`img[src="x"]`)).not.toBeInTheDocument();
    expect(dom.querySelector("[onerror]")).not.toBeInTheDocument();
    expect(getExecutionFlag()).toBe(false);
  });

  it("escapes malformed HTML-like text instead of treating it as live HTML", async () => {
    const mounted = await mountEditor("<custom broken");

    expect(mounted.getMarkdown()).toBe("\\<custom broken\n");
    expect(mounted.view.dom).toHaveTextContent("<custom broken");
    expect(mounted.view.dom.querySelector('[data-type="html"]')).not.toBeInTheDocument();
    expect(mounted.view.dom.querySelector("custom")).not.toBeInTheDocument();
  });

  it("keeps raw HTML code-like styling targetable from the editor root", async () => {
    const mounted = await mountEditor("<div>Block</div>");
    const htmlNode = mounted.view.dom.querySelector('[data-type="html"]');
    const editorCss = readFileSync(editorCssPath, "utf8");

    expect(mounted.getMarkdown()).toBe("<div>Block</div>\n");
    expect(htmlNode).toBeInTheDocument();
    expect(htmlNode?.closest(".leafdown-editor")).toBe(mounted.root);
    expect(editorCss).toContain('& [data-type="html"] {');
    expect(editorCss).toContain("font-mono");
    expect(editorCss).toContain("bg-muted");
    expect(editorCss).toContain("text-muted-foreground");
  });

  it("does not execute script content when the React wrapper remounts a document", async () => {
    resetExecutionFlag();

    const { rerender } = render(
      <MilkdownEditor documentKey="safe-document" initialMarkdown="Safe document" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("milkdown-editor-host")).toHaveTextContent("Safe document");
    });

    rerender(
      <MilkdownEditor
        documentKey="script-document"
        initialMarkdown={`<script>window.${executionFlag} = true</script>`}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("milkdown-editor-host")).toHaveTextContent(
        `<script>window.${executionFlag} = true</script>`,
      );
    });

    const editorHost = screen.getByTestId("milkdown-editor-host");

    expect(editorHost).toHaveClass("leafdown-editor");
    expect(editorHost.querySelector("script")).not.toBeInTheDocument();
    expect(getExecutionFlag()).toBe(false);
  });
});
