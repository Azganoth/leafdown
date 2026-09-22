// @vitest-environment happy-dom

import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  flushEditorDomObserver,
  getEditorDomTextNode,
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import { finalizeSourceProjection, hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount();
const SOURCE = "<section>\n<strong>Body</strong>\n</section>";
const MARKDOWN = `Before\n\n${SOURCE}\n\nAfter\n`;

const setCaretRangeAt = (node: Node, offset: number) => {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: () => range,
  });
};

describe("raw HTML source projection", () => {
  it("maps a primary click in rendered text to the matching source position", async () => {
    const mounted = await mountEditor(MARKDOWN);
    const position = getEditorNodePosition(mounted, "html");
    const strong = mounted.view.dom.querySelector("section strong")!;
    setCaretRangeAt(strong.firstChild!, 2);
    dispatchMouseEvent(strong, "mousedown", { button: 0 });
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("");
    expect(mounted.view.state.selection.from).toBe(position + SOURCE.indexOf("Body") + 2);

    const body = getEditorTextPosition(mounted, "Body");
    setTextSelection(mounted.view, body, body + 4);
    typeText(mounted.view, "Replacement");
    expect(mounted.getMarkdown()).toBe(MARKDOWN.replace("Body", "Replacement"));
    expect(
      mounted.view.dom.querySelector('[data-html-rendered="true"] section strong'),
    ).toHaveTextContent("Replacement");
  });

  it("maps a primary click in muted fallback text to the matching source position", async () => {
    const source = '<div class="note">Fallback</div>';
    const mounted = await mountEditor(source);
    const position = getEditorNodePosition(mounted, "html");
    const fallback = mounted.view.dom.querySelector<HTMLElement>('[data-html-rendered="false"]')!;
    setCaretRangeAt(fallback.firstChild!, source.indexOf("Fallback") + 4);
    dispatchMouseEvent(fallback, "mousedown", { button: 0 });

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(position + source.indexOf("Fallback") + 4);
  });

  it.each(["<!-- comment -->", "<div onclick='alert(1)'>Body</div>", "<div>unfinished"])(
    "restores unchanged unsupported source exactly: %s",
    async (source) => {
      const markdown = `Before\n\n${source}\n\nAfter\n`;
      const mounted = await mountEditor(markdown);
      setTextSelection(mounted.view, getEditorNodePosition(mounted, "html"));
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(mounted.getMarkdown()).toBe(markdown);
      expect(mounted.view.dom.querySelector('[data-html-rendered="false"]')).toHaveTextContent(
        source,
      );
    },
  );
  it("edits one of two adjacent HTML atoms without converting its neighbour to text", async () => {
    const mounted = await mountEditor("first<br><br>last\n");
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "html") + 1);
    const start = getEditorTextPosition(mounted, "<br>");
    setTextSelection(mounted.view, start, start + 4);
    typeText(mounted.view, "<br/>");
    expect(mounted.getMarkdown()).toBe("first<br><br/>last\n");
    expect(mounted.view.dom.querySelectorAll('[data-html-rendered="true"]')).toHaveLength(2);
  });
  it.each(["left", "right", "node"] as const)(
    "enters from %s and restores untouched source",
    async (side) => {
      const changed = vi.fn();
      const mounted = await mountEditor(MARKDOWN, { onContentChanged: changed });
      expect(
        mounted.view.dom.querySelector('[data-html-rendered="true"] section strong'),
      ).toHaveTextContent("Body");
      const position = getEditorNodePosition(mounted, "html");
      if (side === "node") {
        mounted.view.dispatch(
          mounted.view.state.tr.setSelection(
            NodeSelection.create(mounted.view.state.doc, position),
          ),
        );
      } else {
        setTextSelection(mounted.view, position + (side === "right" ? 1 : 0));
      }
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toContain(SOURCE);
      expect(mounted.view.dom.querySelector("input")).toBeNull();
      expect(getSelectedEditorText(mounted)).toBe(side === "node" ? SOURCE : "");
      expect(mounted.view.state.selection.from).toBe(
        position + (side === "right" ? SOURCE.length : 0),
      );
      setSelectionAtDocumentEnd(mounted.view);
      expect(mounted.getMarkdown()).toBe(MARKDOWN);
      expect(changed).not.toHaveBeenCalled();
    },
  );

  it("finalizes edits on save and supports local and native history", async () => {
    const changed = vi.fn();
    const mounted = await mountEditor(MARKDOWN, { onContentChanged: changed });
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "html"));
    const body = getEditorTextPosition(mounted, "Body");
    setTextSelection(mounted.view, body, body + 4);
    typeText(mounted.view, "New");
    expect(changed).toHaveBeenCalled();
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(getEditorTextContent(mounted)).toContain("Ne</strong>");
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(MARKDOWN.replace("Body", "New"));
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.dom.querySelector("section strong")).toHaveTextContent("New");
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(MARKDOWN);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(MARKDOWN.replace("Body", "New"));
  });

  it.each(["<div>unfinished", "<div style='color:red'>Unsafe</div>", "plain \\ text", ""])(
    "commits unsupported edited source literally: %s",
    async (source) => {
      const mounted = await mountEditor(MARKDOWN);
      const position = getEditorNodePosition(mounted, "html");
      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, position)),
      );
      if (source) typeText(mounted.view, source);
      else runKeyDownHandlers(mounted.view, "Backspace");
      finalizeSourceProjection(mounted.view);
      expect(mounted.view.state.doc.child(1).textContent).toBe(source);
      expect(mounted.view.dom.querySelector('[data-type="html"]')).toBeNull();
      const reopened = await mountEditor(mounted.getMarkdown());
      expect(reopened.view.dom.querySelector('[data-type="html"]')).toBeNull();
      expect(getEditorTextContent(reopened)).toContain(source);
    },
  );

  it("inserts a newline with Enter and preserves it through DOM reparsing", async () => {
    const mounted = await mountEditor(MARKDOWN);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "html"));
    const body = getEditorTextPosition(mounted, "Body");
    setTextSelection(mounted.view, body + 2);
    expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    const text = getEditorDomTextNode(mounted, "Bo\ndy");
    text.textContent = text.textContent.replace("Bo\ndy", "Bo\nDY");
    flushEditorDomObserver(mounted.view);
    expect(mounted.getMarkdown()).toBe(MARKDOWN.replace("Body", "Bo\nDY"));
  });
});
