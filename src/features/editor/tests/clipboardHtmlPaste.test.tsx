import { describe, expect, it } from "vitest";

import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { setupClipboardMock } from "@/test/mocks/clipboard";
import { dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextPosition,
  setSelectionAtElementTextEnd,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";

const START_FRAGMENT_MARKER = "<!--StartFragment-->";
const END_FRAGMENT_MARKER = "<!--EndFragment-->";
const INLINE_PROSEMIRROR_FRAGMENT = '<p data-pm-slice="1 1 []"><strong>Strong</strong></p>';

const mountEditor = setupMilkdownEditorMount();
const { clipboard, createClipboardItem } = setupClipboardMock();

type PasteEntryPath = "command" | "native";

const wrapCfHtmlFragment = (fragment: string) =>
  `<html>\r\n<body>\r\n  \r\n${START_FRAGMENT_MARKER}${fragment}${END_FRAGMENT_MARKER}\r\n  \r\n</body>\r\n</html>`;

const pasteHtml = async (
  mounted: MountedMilkdownEditor,
  entryPath: PasteEntryPath,
  html: string,
  text = "Strong",
) => {
  if (entryPath === "native") {
    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: html,
      [TEXT_PLAIN_MIME_TYPE]: text,
    });

    expect(event.defaultPrevented).toBe(true);
    return;
  }

  clipboard.read.mockResolvedValue([createClipboardItem(TEXT_HTML_MIME_TYPE, html)]);
  clipboard.readText.mockResolvedValue(text);

  expect(await runEditorCommand(mounted.editor, "edit.paste")).toBe(true);
};

const transformPastedHtml = (mounted: MountedMilkdownEditor, html: string) => {
  const transform = mounted.view.someProp("transformPastedHTML");

  if (!transform) {
    throw new Error("Expected the editor to provide transformPastedHTML.");
  }

  return transform(html, mounted.view);
};

const serializeTextSelection = async (markdown: string, first: string, last = first) => {
  const mounted = await mountEditor(markdown);
  const from = getEditorTextPosition(mounted, first);
  const to = getEditorTextPosition(mounted, last) + last.length;

  setTextSelection(mounted.view, from, to);

  return mounted.view.serializeForClipboard(mounted.view.state.selection.content());
};

const documentContainsNode = (mounted: MountedMilkdownEditor, nodeTypeName: string) => {
  let found = false;

  mounted.view.state.doc.descendants((node) => {
    found ||= node.type.name === nodeTypeName;
  });

  return found;
};

describe("CF_HTML paste normalization", () => {
  it.each(["native", "command"] as const)(
    "removes transport whitespace in an empty article through %s Paste",
    async (entryPath) => {
      const serialized = await serializeTextSelection(
        "Leading **Strong** trailing",
        "Leading",
        "trailing",
      );
      const mounted = await mountEditor("");

      await pasteHtml(
        mounted,
        entryPath,
        wrapCfHtmlFragment(serialized.dom.innerHTML),
        serialized.text,
      );

      expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("Strong");
      expect(mounted.getMarkdown()).toBe("Leading **Strong** trailing\n");
    },
  );

  it.each(["native", "command"] as const)(
    "does not merge transport whitespace into a populated article through %s Paste",
    async (entryPath) => {
      const serialized = await serializeTextSelection(
        "Leading **Strong** trailing",
        "Leading",
        "trailing",
      );
      const mounted = await mountEditor("BeforeAfter");
      const insertionPosition = getEditorTextPosition(mounted, "After");

      setTextSelection(mounted.view, insertionPosition);
      await pasteHtml(
        mounted,
        entryPath,
        wrapCfHtmlFragment(serialized.dom.innerHTML),
        serialized.text,
      );

      expect(mounted.getMarkdown()).toBe("BeforeLeading **Strong** trailingAfter\n");
    },
  );

  it.each([
    ["list", "- First\n- Second", "First", "Second", "bullet_list"],
    ["table", "| Header | Value |\n| --- | --- |\n| Cell | Data |", "Header", "Data", "table"],
    ["blockquote", "> First\n>\n> Second", "First", "Second", "blockquote"],
  ])(
    "preserves an open %s slice and its ProseMirror context",
    async (_, markdown, first, last, nodeTypeName) => {
      const serialized = await serializeTextSelection(markdown, first, last);
      const fragment = serialized.dom.innerHTML;
      const directPaste = await mountEditor("");
      const wrappedPaste = await mountEditor("");

      expect(fragment).toContain("data-pm-slice");

      await pasteHtml(directPaste, "native", fragment, serialized.text);
      await pasteHtml(wrappedPaste, "native", wrapCfHtmlFragment(fragment), serialized.text);

      expect(wrappedPaste.view.state.doc.toJSON()).toEqual(directPaste.view.state.doc.toJSON());
      expect(documentContainsNode(wrappedPaste, nodeTypeName)).toBe(true);
    },
  );

  it("composes with Milkdown's existing pasted-HTML transform", async () => {
    const mounted = await mountEditor("");
    const fragment =
      '<b id="docs-internal-guid-test"><p data-pm-slice="1 1 []"><strong>Strong</strong></p></b>';

    expect(transformPastedHtml(mounted, wrapCfHtmlFragment(fragment))).toBe(
      INLINE_PROSEMIRROR_FRAGMENT,
    );
  });

  it("passes non-qualifying external fragment conventions through unchanged", async () => {
    const mounted = await mountEditor("");
    const affineStyleHtml =
      `<html><body>${START_FRAGMENT_MARKER}` +
      "<html><head></head><body><p><strong>Strong</strong></p></body></html>" +
      `${END_FRAGMENT_MARKER}</body></html>`;

    expect(transformPastedHtml(mounted, affineStyleHtml)).toBe(affineStyleHtml);
  });

  it("keeps native paste literal inside active source projection", async () => {
    const mounted = await mountEditor("**Bold** plain");

    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    const sourceStart = getEditorTextPosition(mounted, "**Bold**");
    setTextSelection(mounted.view, sourceStart + 2, sourceStart + "**Bold".length);

    const { event } = dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_HTML_MIME_TYPE]: wrapCfHtmlFragment(INLINE_PROSEMIRROR_FRAGMENT),
      [TEXT_PLAIN_MIME_TYPE]: "*Paste*",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.getMarkdown()).toBe("***Paste*** plain\n");
  });
});
