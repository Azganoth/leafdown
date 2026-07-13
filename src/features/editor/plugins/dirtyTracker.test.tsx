import { describe, expect, it, vi } from "vitest";

import { BOLD_PLAIN_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  typeText,
} from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();

describe("Leafdown dirty tracker plugin", () => {
  it("does not mark the document dirty when initial Markdown is mounted", async () => {
    const onContentChanged = vi.fn();

    await mountEditor("# Notes", { onContentChanged });

    expect(onContentChanged).not.toHaveBeenCalled();
  });

  it("marks the document dirty after a document-changing history transaction", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor("Hello", { onContentChanged });

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");

    expect(onContentChanged).toHaveBeenCalledTimes(1);
  });

  it("ignores programmatic document transactions outside editor history", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor("Hello", { onContentChanged });

    setSelectionAtDocumentEnd(mounted.view);
    const transaction = mounted.view.state.tr
      .insertText("!", mounted.view.state.selection.from)
      .setMeta("addToHistory", false);

    mounted.view.dispatch(transaction);

    expect(onContentChanged).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe("Hello!\n");
  });

  it("tracks source-projection edits without counting projection housekeeping", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(BOLD_PLAIN_MARKDOWN, { onContentChanged });
    const strong = getEditorDomElement(mounted, "strong");

    setSelectionAtElementTextEnd(mounted.view, strong);

    expect(onContentChanged).not.toHaveBeenCalled();
    expect(getEditorTextContent(mounted)).toBe(BOLD_PLAIN_MARKDOWN);

    typeText(mounted.view, "er");

    expect(onContentChanged).toHaveBeenCalledTimes(2);
    expect(getEditorTextContent(mounted)).toBe("**Bolder** plain");

    setSelectionAtDocumentEnd(mounted.view);

    expect(onContentChanged).toHaveBeenCalledTimes(2);
    expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
  });
});
