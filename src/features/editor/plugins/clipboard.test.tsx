import { describe, expect, it, vi } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { BOLD_PLAIN_MARKDOWN, HELLO_WORLD_TEXT } from "@/test/fixtures/editorMarkdown";
import {
  createClipboardData,
  dispatchClipboardEvent,
  parseClipboardHtml,
} from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtElementTextEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import { hasActiveSourceProjection } from "./sourceProjection";

const mountEditor = setupMilkdownEditorMount();

describe("native editor clipboard events", () => {
  it("copies regular selections as plain text and semantic HTML", async () => {
    const mounted = await mountEditor("*Emphasis* and **Strong**");
    const clipboardData = createClipboardData();

    setTextSelection(mounted.view, 1, mounted.view.state.doc.content.size - 1);

    const { event } = dispatchClipboardEvent(mounted.view.dom, "copy", clipboardData);
    const fragment = parseClipboardHtml(clipboardData);

    expect(event.defaultPrevented).toBe(true);
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe("*Emphasis* and **Strong**\n");
    expect(fragment.querySelector("em")).toHaveTextContent("Emphasis");
    expect(fragment.querySelector("strong")).toHaveTextContent("Strong");
    expect(fragment.querySelector("[data-pm-slice]")).not.toBeNull();
  });

  it.each([
    { source: String.raw`\# not a heading`, copied: String.raw`\# not a heading` },
    { source: String.raw`\*not emphasis* tail`, copied: String.raw`\*not emphasis* tail` },
    {
      source: String.raw`\[test link](./test.html) tail`,
      copied: String.raw`\[test link](./test.html) tail`,
    },
    {
      source: `${String.raw`\# not a heading`}\n\nSecond`,
      copied: `${String.raw`\# not a heading`}\n\nSecond\n`,
    },
    { source: String.raw`\# not a *heading*`, copied: `${String.raw`\# not a *heading*`}\n` },
  ])("copies $source as the Markdown the save path writes", async ({ source, copied }) => {
    const mounted = await mountEditor(source);
    const clipboardData = createClipboardData();

    setTextSelection(mounted.view, 1, mounted.view.state.doc.content.size - 1);

    dispatchClipboardEvent(mounted.view.dom, "copy", clipboardData);

    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe(copied);
    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("copies code block text as its own characters", async () => {
    const mounted = await mountEditor("```\n# code\n```");
    const clipboardData = createClipboardData();

    setTextSelection(mounted.view, 1, mounted.view.state.doc.content.size - 1);

    dispatchClipboardEvent(mounted.view.dom, "copy", clipboardData);

    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe("# code");
  });

  it.each(["forward", "backward"] as const)(
    "copies a %s projected selection as exact source and semantic HTML",
    async (direction) => {
      const source = "__Strong text__";
      const mounted = await mountEditor(`${source} plain`);
      const clipboardData = createClipboardData();

      setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

      const sourceStart = getEditorTextPosition(mounted, source);
      const sourceEnd = sourceStart + source.length;
      setTextSelection(
        mounted.view,
        direction === "forward" ? sourceStart : sourceEnd,
        direction === "forward" ? sourceEnd : sourceStart,
      );

      const stateBefore = mounted.view.state;
      const { event } = dispatchClipboardEvent(mounted.view.dom, "copy", clipboardData);
      const fragment = parseClipboardHtml(clipboardData);

      expect(event.defaultPrevented).toBe(true);
      expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe(source);
      expect(fragment.querySelector("strong")).toHaveTextContent("Strong text");
      expect(fragment.querySelector("[data-pm-slice]")).not.toBeNull();
      expect(mounted.view.state).toBe(stateBefore);
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    },
  );

  it("falls back to literal projected HTML when a selection has no semantic mapping", async () => {
    const source = "**Bold**";
    const mounted = await mountEditor(source);
    const clipboardData = createClipboardData();

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, source);
    setTextSelection(mounted.view, sourceStart, sourceStart + 2);

    dispatchClipboardEvent(mounted.view.dom, "copy", clipboardData);

    const fragment = parseClipboardHtml(clipboardData);
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe("**");
    expect(fragment.querySelector("strong, em")).not.toBeInTheDocument();
    expect(fragment.textContent).toBe("**");
  });

  it("cuts a regular selection once and preserves native history", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);
    const clipboardData = createClipboardData();

    setTextSelection(mounted.view, 1, 6);

    const { event } = dispatchClipboardEvent(mounted.view.dom, "cut", clipboardData);

    expect(event.defaultPrevented).toBe(true);
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe("Hello");
    expect(getEditorTextContent(mounted)).toBe(" world");

    expect(runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(HELLO_WORLD_TEXT);

    expect(runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(" world");
  });

  it("cuts projected content through projection-local history", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN, { onContentChanged });
    const clipboardData = createClipboardData();

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);

    const { event } = dispatchClipboardEvent(mounted.view.dom, "cut", clipboardData);

    expect(event.defaultPrevented).toBe(true);
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe("Bold");
    expect(parseClipboardHtml(clipboardData).querySelector("strong")).toHaveTextContent("Bold");
    expect(getEditorTextContent(mounted)).toBe("**** plain");
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(onContentChanged).toHaveBeenCalledOnce();

    expect(runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);

    expect(runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("**** plain");
    expect(onContentChanged).toHaveBeenCalledOnce();
  });

  it("does not delete when writing native clipboard data fails", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);
    const clipboardData = createClipboardData();

    vi.spyOn(clipboardData, "setData").mockImplementation(() => {
      throw new Error("Clipboard write failed");
    });
    setTextSelection(mounted.view, 1, 6);

    const { event } = dispatchClipboardEvent(mounted.view.dom, "cut", clipboardData);

    expect(event.defaultPrevented).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(HELLO_WORLD_TEXT);
  });
});
