// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { getEditorTextContent, setTextSelection } from "@/test/utils/prosemirror";

import { EMPTY_LINK_MARKER, insertLink, insertLinkTarget, LINK_DESTINATION_MARKER } from "./links";

const mountEditor = setupMilkdownEditorMount();

describe("editor link insertion commands", () => {
  it("inserts raw link markers around selections and at collapsed carets", async () => {
    const selectedLinkEditor = await mountEditor("Hello");

    setTextSelection(selectedLinkEditor.view, 1, 6);

    expect(insertLink(selectedLinkEditor.view)).toBe(true);
    expect(getEditorTextContent(selectedLinkEditor)).toBe(`[Hello]${LINK_DESTINATION_MARKER}`);
    expect(selectedLinkEditor.view.dom.querySelector("a")).not.toBeInTheDocument();
    expect(selectedLinkEditor.view.state.selection.from).toBe(9);

    const wordLinkEditor = await mountEditor("Hello");

    setTextSelection(wordLinkEditor.view, 3);

    expect(insertLink(wordLinkEditor.view)).toBe(true);
    expect(getEditorTextContent(wordLinkEditor)).toBe(`He${EMPTY_LINK_MARKER}llo`);
    expect(wordLinkEditor.view.state.selection.from).toBe(4);

    const emptyLinkEditor = await mountEditor("");

    setTextSelection(emptyLinkEditor.view, 1);

    expect(insertLink(emptyLinkEditor.view)).toBe(true);
    expect(getEditorTextContent(emptyLinkEditor)).toBe(EMPTY_LINK_MARKER);
    expect(emptyLinkEditor.view.state.selection.from).toBe(2);
  });

  it("inserts a ready link target at the current selection", async () => {
    const editor = await mountEditor("Read this");

    setTextSelection(editor.view, 6, 10);

    expect(insertLinkTarget(editor.view, { label: "guide.md", target: "docs/guide.md" })).toBe(
      true,
    );
    expect(getEditorTextContent(editor)).toBe("Read [this](docs/guide.md)");

    const emptyEditor = await mountEditor("");

    expect(
      insertLinkTarget(emptyEditor.view, { label: "guide.md", target: "C:/Notes/guide.md" }),
    ).toBe(true);
    expect(getEditorTextContent(emptyEditor)).toBe("[guide.md](C:/Notes/guide.md)");
  });
});
