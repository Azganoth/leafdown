import type { EditorView } from "@milkdown/kit/prose/view";
import { describe, expect, it, vi } from "vitest";

import {
  BASIC_TABLE_MARKDOWN,
  BOLD_PLAIN_MARKDOWN,
  HELLO_WORLD_TEXT,
} from "@/test/fixtures/editorMarkdown";
import { dispatchMouseDown } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorDomElement, setSelectionAtElementTextEnd } from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "./sourceProjection";

const LAST_BLOCK_BOTTOM_PX = 100;

const mountEditor = setupMilkdownEditorMount();

const dispatchClickBelowDocument = (view: EditorView, clientY = LAST_BLOCK_BOTTOM_PX + 50) => {
  const lastElement = view.dom.lastElementChild;

  if (!lastElement) {
    throw new Error("Expected the editor to render a last block element.");
  }

  vi.spyOn(lastElement, "getBoundingClientRect").mockReturnValue({
    bottom: LAST_BLOCK_BOTTOM_PX,
    height: LAST_BLOCK_BOTTOM_PX,
    left: 0,
    right: 160,
    top: 0,
    width: 160,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  return dispatchMouseDown(view.dom, { button: 0, clientX: 20, clientY });
};

const getLastChildDescription = (view: EditorView) => {
  const lastChild = view.state.doc.lastChild;

  return { size: lastChild?.content.size, type: lastChild?.type.name };
};

describe("trailing paragraph plugin", () => {
  it.each([
    { initialMarkdown: HELLO_WORLD_TEXT, name: "text" },
    { initialMarkdown: BASIC_TABLE_MARKDOWN, name: "a table" },
  ])("appends a paragraph when the document ends with $name", async ({ initialMarkdown }) => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(initialMarkdown, { onContentChanged });
    const childCount = mounted.view.state.doc.childCount;

    dispatchClickBelowDocument(mounted.view);

    expect(mounted.view.state.doc.childCount).toBe(childCount + 1);
    expect(getLastChildDescription(mounted.view)).toEqual({ size: 0, type: "paragraph" });
    expect(mounted.view.state.selection.from).toBe(mounted.view.state.doc.content.size - 1);
    expect(onContentChanged).toHaveBeenCalled();
  });

  it("keeps an open source projection formatted", async () => {
    const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN);
    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    dispatchClickBelowDocument(mounted.view);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.getMarkdown()).toContain(BOLD_PLAIN_MARKDOWN);
  });

  it("leaves the document alone when it already ends with an empty paragraph", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    dispatchClickBelowDocument(mounted.view);

    const childCount = mounted.view.state.doc.childCount;
    dispatchClickBelowDocument(mounted.view);

    expect(mounted.view.state.doc.childCount).toBe(childCount);
  });

  it("leaves a click inside the last line native", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    dispatchClickBelowDocument(mounted.view, LAST_BLOCK_BOTTOM_PX - 10);

    expect(mounted.view.state.doc.childCount).toBe(1);
  });
});
