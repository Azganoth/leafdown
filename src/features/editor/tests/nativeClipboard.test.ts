// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { BOLD_PLAIN_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { createClipboardData, dispatchClipboardEvent, dispatchKeyDown } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  getEditorTextPosition,
  setSelectionAtElementTextEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();

describe("native editor clipboard events", () => {
  it("parses Markdown from a native plain-text paste", async () => {
    const mounted = await mountEditor("");

    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_PLAIN_MIME_TYPE]: "**Bold**",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("**Bold**");
    expect(mounted.getMarkdown()).toBe("**Bold**\n");
    expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("Bold");
  });

  it("preserves semantic HTML from a native rich-text paste", async () => {
    const mounted = await mountEditor("");

    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: "<p><strong>Rich</strong> text</p>",
      [TEXT_PLAIN_MIME_TYPE]: "Rich text",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("Rich");
    expect(mounted.getMarkdown()).toBe("**Rich** text\n");
  });

  it.each([
    { name: "bare", source: "https://example.com" },
    { name: "angle-bracket", source: "<https://example.com>" },
  ])("carries the $name autolink form through a copy and a paste", async ({ source }) => {
    const copied = await mountEditor(source);
    const clipboardData = createClipboardData();

    setTextSelection(copied.view, 1, copied.view.state.doc.content.size - 1);
    dispatchClipboardEvent(copied.view.dom, "copy", clipboardData);

    const pasted = await mountEditor("");

    dispatchClipboardEvent(pasted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: clipboardData.getData(TEXT_HTML_MIME_TYPE),
    });

    expect(pasted.getMarkdown()).toBe(`${source}\n`);
  });

  it("preserves semantic HTML-only content outside source projection", async () => {
    const mounted = await mountEditor("");

    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: "<p><strong>Rich</strong> text</p>",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("Rich");
    expect(mounted.getMarkdown()).toBe("**Rich** text\n");
  });

  it("uses the native paste-as-plain-text gesture without parsing rich content", async () => {
    const mounted = await mountEditor("");

    const shortcut = dispatchKeyDown(mounted.view.dom, "v", {
      ctrl: true,
      keyCode: 86,
      shift: true,
    });
    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: "<p><strong>Bold</strong></p>",
      [TEXT_PLAIN_MIME_TYPE]: "**Bold**",
    });

    expect(shortcut.defaultPrevented).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(getEditorTextContent(mounted)).toBe("**Bold**");
  });

  it("pastes literal plain text inside an active source projection", async () => {
    const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN);

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, "**Bold**");

    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);

    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: "<p><em>Paste</em></p>",
      [TEXT_PLAIN_MIME_TYPE]: "*Paste*",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("***Paste*** plain");
  });

  it("consumes HTML-only content inside an active source projection", async () => {
    const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN);

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, "**Bold**");

    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);

    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: "<p><em>Paste</em></p>",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);
  });
});
