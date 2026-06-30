import { afterEach, describe, expect, it } from "vitest";

import { MilkdownEditor } from "@/features/editor";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { render, screen, waitFor } from "@/test/utils/react";

const executionFlag = "__leafdownHtmlExecuted";
const mountEditor = setupMilkdownEditorMount();

const mountStyledEditor = (initialMarkdown: string) =>
  mountEditor(initialMarkdown, {
    rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
  });

const getExecutionFlag = (): unknown =>
  (window as unknown as Record<string, unknown>)[executionFlag];

const resetExecutionFlag = () => {
  (window as unknown as Record<string, unknown>)[executionFlag] = false;
};

describe("HTML safety", () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)[executionFlag];
  });

  it("renders block and inline HTML as text-only Milkdown HTML atoms", async () => {
    resetExecutionFlag();

    const markdown = `<div onclick="window.${executionFlag} = true">Block</div>

Inline <span onmouseover="window.${executionFlag} = true">HTML</span> text.`;
    const mounted = await mountStyledEditor(markdown);
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
    const mounted = await mountStyledEditor(markdown);
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
    const mounted = await mountStyledEditor("<custom broken");

    expect(mounted.getMarkdown()).toBe("\\<custom broken\n");
    expect(mounted.view.dom).toHaveTextContent("<custom broken");
    expect(mounted.view.dom.querySelector('[data-type="html"]')).not.toBeInTheDocument();
    expect(mounted.view.dom.querySelector("custom")).not.toBeInTheDocument();
  });

  it("does not execute script content when the React wrapper remounts a document", async () => {
    resetExecutionFlag();

    const { rerender } = render(
      <MilkdownEditor key="safe-document" initialMarkdown="Safe document" />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("milkdown-editor-host")).toHaveTextContent("Safe document");
    });

    rerender(
      <MilkdownEditor
        key="script-document"
        initialMarkdown={`<script>window.${executionFlag} = true</script>`}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("milkdown-editor-host")).toHaveTextContent(
        `<script>window.${executionFlag} = true</script>`,
      );
    });

    const editorHost = screen.getByTestId("milkdown-editor-host");

    expect(editorHost).toHaveClass(EDITOR_TEST_ROOT_CLASS_NAME);
    expect(editorHost.querySelector("script")).not.toBeInTheDocument();
    expect(getExecutionFlag()).toBe(false);
  });
});
