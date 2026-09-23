// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { BOLD_PLAIN_MARKDOWN, HELLO_WORLD_TEXT } from "@/test/fixtures/editorMarkdown";
import { setupClipboardMock } from "@/test/mocks/clipboard";
import { parseClipboardHtml } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";

import {
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "../../plugins/blockSelection";
import { hasActiveSourceProjection } from "../../plugins/sourceProjection";
import { runEditorCommand } from "../index";
import { copySelection, cutSelection, paste } from "./clipboard";
import { selectAll } from "./selection";

const mountEditor = setupMilkdownEditorMount();
const { clipboard, createClipboardItem, expectClipboardTextWritten, getClipboardHtmlWritten } =
  setupClipboardMock();
const getRichClipboardText = async () =>
  clipboard.write.mock.lastCall?.[0][0]?.getType(TEXT_PLAIN_MIME_TYPE).then((blob) => blob.text());

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

  it("retains semantic HTML for broader selections outside source projection", async () => {
    const source = "*Emphasis* and **Strong**";
    const mounted = await mountEditor(source);

    setTextSelection(mounted.view, 1, mounted.view.state.doc.content.size - 1);

    await expect(copySelection(mounted.view, "default")).resolves.toBe(true);

    const fragment = parseClipboardHtml(await getClipboardHtmlWritten());
    expect(fragment.querySelector("em")).toHaveTextContent("Emphasis");
    expect(fragment.querySelector("strong")).toHaveTextContent("Strong");
  });

  it("copies portable HTML as source text and rich text with an unformatted fallback", async () => {
    const mounted = await mountEditor("*Emphasis* and **Strong**");
    setTextSelection(mounted.view, 1, mounted.view.state.doc.content.size - 1);
    const stateBefore = mounted.view.state;

    await expect(copySelection(mounted.view, "html")).resolves.toBe(true);
    expect(clipboard.write).not.toHaveBeenCalled();
    const html = clipboard.writeText.mock.lastCall?.[0] ?? "";
    expect(html).toContain("<em>Emphasis</em>");
    expect(html).toContain("<strong>Strong</strong>");
    expect(html).not.toContain("data-pm-slice");

    await expect(copySelection(mounted.view, "richText")).resolves.toBe(true);
    expect(await getClipboardHtmlWritten()).toBe(html);
    await expect(getRichClipboardText()).resolves.toBe("Emphasis and Strong");
    expect(mounted.view.state).toBe(stateBefore);
  });

  it("exports projected semantic content and keeps unmappable source literal", async () => {
    const mounted = await mountEditor("**Bold** plain");
    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));
    const sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart, sourceStart + 8);
    const stateBefore = mounted.view.state;

    await expect(copySelection(mounted.view, "richText")).resolves.toBe(true);
    expect(await getClipboardHtmlWritten()).toContain("<strong>Bold</strong>");
    await expect(getRichClipboardText()).resolves.toBe("Bold");
    await expect(copySelection(mounted.view, "html")).resolves.toBe(true);
    expect(clipboard.writeText.mock.lastCall?.[0]).toContain("<strong>Bold</strong>");

    setTextSelection(mounted.view, sourceStart, sourceStart + 2);
    await expect(copySelection(mounted.view, "richText")).resolves.toBe(true);
    expect(await getClipboardHtmlWritten()).not.toContain("<strong>");
    await expect(getRichClipboardText()).resolves.toBe("**");
    expect(mounted.view.state.doc).toBe(stateBefore.doc);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
  });

  it("exports a structural block selection without Markdown in the rich fallback", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n");
    const item = getSelectableBlockTargets(mounted.view.state.doc).find(
      ({ node }) => node.type.name === "list_item" && node.textContent === "First",
    );
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, item!.pos),
      ),
    );
    const stateBefore = mounted.view.state;

    await expect(copySelection(mounted.view, "richText")).resolves.toBe(true);
    expect(
      parseClipboardHtml(await getClipboardHtmlWritten()).querySelector("li"),
    ).toHaveTextContent("First");
    expect(await getRichClipboardText()).toContain("First");
    expect(await getRichClipboardText()).not.toContain("- First");
    expect(mounted.view.state).toBe(stateBefore);
  });

  it("cuts the current selection after copying it", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    setTextSelection(mounted.view, 1, 6);

    await expect(cutSelection(mounted.view)).resolves.toBe(true);

    await expectClipboardTextWritten("Hello");
    expect(getEditorTextContent(mounted)).toBe(" world");
  });

  it("does not delete when the clipboard write fails", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);
    const error = new Error("Clipboard write failed");

    setTextSelection(mounted.view, 1, 6);
    clipboard.write.mockRejectedValueOnce(error);

    await expect(cutSelection(mounted.view)).rejects.toBe(error);
    expect(getEditorTextContent(mounted)).toBe(HELLO_WORLD_TEXT);
  });

  it("does not delete a stale selection after an asynchronous clipboard write", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);
    let resolveClipboardWrite: (() => void) | undefined;

    clipboard.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveClipboardWrite = resolve;
        }),
    );
    setTextSelection(mounted.view, 1, 6);

    const cutResult = cutSelection(mounted.view);

    setTextSelection(mounted.view, 7, 12);
    resolveClipboardWrite?.();

    await expect(cutResult).resolves.toBe(false);
    expect(getEditorTextContent(mounted)).toBe(HELLO_WORLD_TEXT);
  });

  it("does not delete after the document changes during an asynchronous clipboard write", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);
    let resolveClipboardWrite: (() => void) | undefined;

    clipboard.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveClipboardWrite = resolve;
        }),
    );
    setTextSelection(mounted.view, 1, 6);

    const cutResult = cutSelection(mounted.view);

    mounted.view.dispatch(mounted.view.state.tr.insertText("!", 12));
    resolveClipboardWrite?.();

    await expect(cutResult).resolves.toBe(false);
    expect(getEditorTextContent(mounted)).toBe(`${HELLO_WORLD_TEXT}!`);
  });

  it("cuts projected content through projection-local history", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN, { onContentChanged });

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);

    await expect(cutSelection(mounted.view)).resolves.toBe(true);

    await expectClipboardTextWritten("Bold");
    const html = await getClipboardHtmlWritten();
    expect(parseClipboardHtml(html).querySelector("strong")).toHaveTextContent("Bold");
    expect(getEditorTextContent(mounted)).toBe("**** plain");
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(onContentChanged).toHaveBeenCalledOnce();

    expect(runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    expect(runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("**** plain");
    expect(onContentChanged).toHaveBeenCalledOnce();
  });

  it("does not delete a changed selection after an asynchronous projected cut write", async () => {
    const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN);

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);

    let resolveWrite: (() => void) | undefined;
    clipboard.write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const cutPromise = cutSelection(mounted.view);

    const plainStart = getEditorTextPosition(mounted, "plain");
    setTextSelection(mounted.view, plainStart, plainStart + "plain".length);

    expect(resolveWrite).toBeTypeOf("function");
    resolveWrite?.();

    await expect(cutPromise).resolves.toBe(false);
    await expectClipboardTextWritten("Bold");
    expect(mounted.getMarkdown()).toBe("**Bold** plain\n");
  });

  it("cuts a complete projected object without finalizing before deletion", async () => {
    const source = "**Bold**";
    const mounted = await mountEditor(`${source}tail`);

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart, sourceStart + source.length);

    await expect(cutSelection(mounted.view)).resolves.toBe(true);

    await expectClipboardTextWritten(source);
    expect(
      parseClipboardHtml(await getClipboardHtmlWritten()).querySelector("strong"),
    ).toHaveTextContent("Bold");
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    setSelectionAtDocumentEnd(mounted.view);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.getMarkdown()).toBe("tail\n");
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

  it("replaces a nested block selection from external Markdown or HTML clipboard data", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n");
    const items = getSelectableBlockTargets(mounted.view.state.doc).filter(
      ({ node }) => node.type.name === "list_item",
    );
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, items[1].pos),
      ),
    );
    clipboard.read.mockResolvedValueOnce([]);
    clipboard.readText.mockResolvedValueOnce("- Markdown replacement\n");

    await expect(paste(mounted.editor, "default")).resolves.toBe(true);
    expect(mounted.getMarkdown()).toContain("Markdown replacement");
    expect(mounted.getMarkdown()).not.toContain("First");
    expect(mounted.getMarkdown()).toContain("Second");

    const replacement = getSelectableBlockTargets(mounted.view.state.doc).find(
      ({ node }) => node.type.name === "list_item" && node.textContent === "Markdown replacement",
    );
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, replacement!.pos),
      ),
    );
    clipboard.read.mockResolvedValueOnce([
      createClipboardItem(TEXT_HTML_MIME_TYPE, "<li><p>HTML replacement</p></li>"),
    ]);

    await expect(paste(mounted.editor, "default")).resolves.toBe(true);
    expect(mounted.getMarkdown()).toContain("HTML replacement");
    expect(mounted.getMarkdown()).not.toContain("Markdown replacement");
    expect(mounted.getMarkdown()).toContain("Second");
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
