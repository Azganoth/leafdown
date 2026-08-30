// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { BASIC_TABLE_MARKDOWN, UNCHECKED_TASK_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { dispatchInput, dispatchKeyDown } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorNodePosition,
  getEditorTextContent,
  setSelectionAtElementTextEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";
import { waitFor, within } from "@/test/utils/react";

const mountStyledEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

describe("marker presentation", () => {
  it("shows subtle heading markers only for collapsed caret context", async () => {
    const mounted = await mountStyledEditor("# Heading");
    const heading = getEditorDomElement(mounted, "h1");

    const position = setSelectionAtElementTextEnd(mounted.view, heading);

    expect(heading).toHaveClass("leafdown-marker-node--subtle");
    expect(heading).toHaveAttribute("data-leafdown-marker", "H1");

    setTextSelection(mounted.view, Math.max(1, position - 3), position);

    expect(heading).not.toHaveClass("leafdown-marker-node--subtle");
    expect(heading).not.toHaveAttribute("data-leafdown-marker");
  });

  it("keeps footnote definition markers persistent", async () => {
    const mounted = await mountStyledEditor("Text[^note]\n\n[^note]: Detail");

    expect(mounted.view.dom.querySelector(".leafdown-marker-widget--persistent")).toHaveTextContent(
      "[^note]:",
    );

    setTextSelection(mounted.view, 1, 5);

    expect(mounted.view.dom.querySelector(".leafdown-marker-widget--persistent")).toHaveTextContent(
      "[^note]:",
    );
  });

  it("does not add caret markers to blockquotes or list items", async () => {
    const mounted = await mountStyledEditor(`> Quote

3. Ordered

- Bullet

${UNCHECKED_TASK_MARKDOWN}`);
    const blockquote = getEditorDomElement(mounted, "blockquote");
    const orderedListItem = getEditorDomElement(mounted, "ol li");
    const unorderedListItem = getEditorDomElement(mounted, "ul li:not([data-checked])");
    const taskListItem = getEditorDomElement(mounted, "li[data-checked='false']");

    setSelectionAtElementTextEnd(mounted.view, blockquote);

    expect(blockquote).not.toHaveClass("leafdown-marker-node--subtle");
    expect(blockquote).not.toHaveAttribute("data-leafdown-marker");

    setSelectionAtElementTextEnd(mounted.view, orderedListItem);

    expect(orderedListItem).not.toHaveClass("leafdown-marker-node--subtle");
    expect(orderedListItem).not.toHaveAttribute("data-leafdown-marker");

    setSelectionAtElementTextEnd(mounted.view, unorderedListItem);

    expect(unorderedListItem).not.toHaveClass("leafdown-marker-node--subtle");
    expect(unorderedListItem).not.toHaveAttribute("data-leafdown-marker");

    setSelectionAtElementTextEnd(mounted.view, taskListItem);

    expect(taskListItem).not.toHaveClass("leafdown-marker-node--subtle");
    expect(taskListItem).not.toHaveAttribute("data-leafdown-marker");
  });

  it("leaves footnote-reference source editing to in-document projection", async () => {
    const mounted = await mountStyledEditor("Text[^note]\n\n[^note]: Detail");
    const footnoteReferencePos = getEditorNodePosition(mounted, "footnote_reference");

    setTextSelection(mounted.view, footnoteReferencePos);

    expect(getEditorTextContent(mounted)).toContain("Text[^note]");
    expect(
      Array.from(
        mounted.view.dom.querySelectorAll("[data-leafdown-source~='footnote-reference']"),
        (element) => element.textContent,
      ).join(""),
    ).toBe("[^note]");
    expect(
      within(mounted.view.dom).queryByRole("textbox", { name: "Markdown source" }),
    ).not.toBeInTheDocument();
  });

  it("exposes raw HTML as editable raw Markdown source", async () => {
    const mounted = await mountStyledEditor("<span>HTML</span>");
    const htmlPos = getEditorNodePosition(mounted, "html", (node) =>
      String(node.attrs.value).startsWith("<span"),
    );

    setTextSelection(mounted.view, htmlPos);

    const input = within(mounted.view.dom).getByRole("textbox", { name: "Markdown source" });

    expect(input).toHaveValue("<span>");

    dispatchInput(input, "<mark>");
    dispatchKeyDown(input, "Enter");

    await waitFor(() => {
      expect(mounted.getMarkdown()).toContain("<mark>HTML</span>");
    });
  });

  it("keeps code blocks visual without MVP language controls", async () => {
    const mounted = await mountStyledEditor(`\`\`\`ts
const value = 1;
\`\`\``);
    const code = getEditorDomElement(mounted, "pre code");

    setSelectionAtElementTextEnd(mounted.view, code);

    expect(mounted.view.dom.querySelector("pre")).toHaveTextContent("const value = 1;");
    expect(mounted.view.dom.querySelector(".leafdown-code-language-input")).not.toBeInTheDocument();
    expect(mounted.view.dom).not.toHaveTextContent("```");
  });

  it("keeps tables and horizontal rules rendered without marker affordances", async () => {
    const mounted = await mountStyledEditor(`First

---

${BASIC_TABLE_MARKDOWN}`);

    expect(getEditorDomElement(mounted, "hr")).toBeInTheDocument();
    expect(mounted.view.dom.querySelector("table")).toHaveTextContent("CD");
    expect(mounted.view.dom).not.toHaveTextContent("---");

    const horizontalRulePos = getEditorNodePosition(mounted, "hr");

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
