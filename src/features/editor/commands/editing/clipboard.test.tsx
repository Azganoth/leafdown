import { describe, expect, it } from "vitest";

import { TEXT_HTML_MIME_TYPE } from "@/lib/mime";
import { BOLD_PLAIN_MARKDOWN, HELLO_WORLD_TEXT } from "@/test/fixtures/editorMarkdown";
import { setupClipboardMock } from "@/test/mocks/clipboard";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { copySelection, cutSelection, paste } from "./clipboard";
import { selectAll } from "./selection";

const mountEditor = setupMilkdownEditorMount();
const { clipboard, createClipboardItem, expectClipboardTextWritten, getClipboardHtmlWritten } =
  setupClipboardMock();

const parseClipboardHtml = (html: string) => {
  const template = document.createElement("template");
  template.innerHTML = html;

  return template.content;
};

describe("editor clipboard commands", () => {
  it("copies selections in plain text and Markdown formats", async () => {
    const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN);

    setTextSelection(mounted.view, 1, 5);

    await expect(copySelection(mounted.view, "plainText")).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenLastCalledWith("Bold");

    expect(selectAll(mounted.view)).toBe(true);

    await expect(copySelection(mounted.view, "markdown")).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenLastCalledWith(expect.stringContaining("**Bold**"));
  });

  it("cuts the current selection after copying it", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    setTextSelection(mounted.view, 1, 6);

    await expect(cutSelection(mounted.view)).resolves.toBe(true);

    await expectClipboardTextWritten("Hello");
    expect(getEditorTextContent(mounted)).toBe(" world");
  });

  it("copies projected source as exact text and semantic HTML", async () => {
    const mounted = await mountEditor("__Strong text__ plain");
    const strong = getEditorDomElement(mounted, "strong");

    setSelectionAtElementTextEnd(mounted.view, strong);

    const source = "__Strong text__";
    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart, sourceStart + source.length);

    const stateBefore = mounted.view.state;

    await expect(copySelection(mounted.view, "default")).resolves.toBe(true);

    await expectClipboardTextWritten(source);
    const html = await getClipboardHtmlWritten();
    const fragment = parseClipboardHtml(html);

    expect(fragment.querySelector("strong")).toHaveTextContent("Strong text");
    expect(fragment.querySelector("[data-pm-slice]")).not.toBeNull();
    expect(mounted.view.state).toBe(stateBefore);
    expect(mounted.getMarkdown()).toBe("__Strong text__ plain\n");
  });

  it("recreates projected formatting when its semantic HTML is pasted", async () => {
    const source = "**Bold**";
    const copied = await mountEditor(source);

    setSelectionAtElementTextEnd(copied.view, getEditorDomElement(copied, "strong"));

    const sourceStart = getEditorTextPosition(copied, source);
    setTextSelection(copied.view, sourceStart, sourceStart + source.length);

    await expect(copySelection(copied.view, "default")).resolves.toBe(true);

    const html = await getClipboardHtmlWritten();
    const pasted = await mountEditor("tail");

    setTextSelection(pasted.view, 1);

    clipboard.read.mockResolvedValue([createClipboardItem(TEXT_HTML_MIME_TYPE, html)]);
    clipboard.readText.mockResolvedValue(source);

    await expect(paste(pasted.editor, "default")).resolves.toBe(true);

    setSelectionAtDocumentEnd(pasted.view);
    expect(pasted.view.dom.querySelector("strong")).toHaveTextContent("Bold");
    expect(pasted.getMarkdown()).toBe("**Bold**tail\n");
  });

  it("keeps projected Copy as formats literal", async () => {
    const source = "**Bold**";
    const mounted = await mountEditor(source);

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart, sourceStart + source.length);

    await expect(copySelection(mounted.view, "plainText")).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenLastCalledWith(source);

    await expect(copySelection(mounted.view, "markdown")).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenLastCalledWith(source);
  });

  it("pastes plain text literally and Markdown as editor content", async () => {
    const plainTextEditor = await mountEditor("");

    clipboard.readText.mockResolvedValue("**Bold**");

    await expect(paste(plainTextEditor.editor, "plainText")).resolves.toBe(true);

    expect(plainTextEditor.view.dom).toHaveTextContent("**Bold**");
    expect(plainTextEditor.view.dom.querySelector("strong")).not.toBeInTheDocument();

    const markdownEditor = await mountEditor("");

    clipboard.readText.mockResolvedValue("**Bold**");

    await expect(paste(markdownEditor.editor, "markdown")).resolves.toBe(true);

    expect(markdownEditor.view.dom).toHaveTextContent("**Bold**");
    expect(markdownEditor.getMarkdown()).toBe("**Bold**\n");
    expect(markdownEditor.view.dom.querySelector("strong")).toBeInTheDocument();
  });

  it("pastes rich text from clipboard HTML when available", async () => {
    const mounted = await mountEditor("");

    clipboard.read.mockResolvedValue([
      createClipboardItem(TEXT_HTML_MIME_TYPE, "<p><strong>Rich</strong> text</p>"),
    ]);

    await expect(paste(mounted.editor, "richText")).resolves.toBe(true);

    expect(mounted.view.dom).toHaveTextContent("Rich text");
    expect(mounted.view.dom.querySelector("strong")).toBeInTheDocument();
  });

  it.each([["default"], ["plainText"], ["markdown"], ["richText"]] as const)(
    "pastes literal clipboard text inside active source projection for %s",
    async (format) => {
      const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN);
      const strong = getEditorDomElement(mounted, "strong");

      setSelectionAtElementTextEnd(mounted.view, strong);

      const sourceStart = getEditorTextPosition(mounted, "**Bold**");

      setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);
      clipboard.read.mockResolvedValue([
        createClipboardItem(TEXT_HTML_MIME_TYPE, "<p><strong>Rich</strong></p>"),
      ]);
      clipboard.readText.mockResolvedValue("*Paste*");

      await expect(paste(mounted.editor, format)).resolves.toBe(true);

      expect(getEditorTextContent(mounted)).toBe("***Paste*** plain");

      setSelectionAtDocumentEnd(mounted.view);
      expect(mounted.getMarkdown()).toBe("***Paste*** plain\n");
    },
  );
});
