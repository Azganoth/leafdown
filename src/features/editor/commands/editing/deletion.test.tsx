import { describe, expect, it } from "vitest";

import { HELLO_WORLD_TEXT } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { deleteForward, deleteWordBackward, deleteWordForward } from "./deletion";

const mountEditor = setupMilkdownEditorMount();

describe("editor deletion commands", () => {
  it("deletes selections and words around the caret", async () => {
    const mounted = await mountEditor(HELLO_WORLD_TEXT);

    setTextSelection(mounted.view, 3);

    expect(deleteForward(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("Helo world");

    setTextSelection(mounted.view, 1, 5);

    expect(deleteForward(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(" world");

    setSelectionAtDocumentEnd(mounted.view);

    expect(deleteWordBackward(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(" ");

    typeText(mounted.view, HELLO_WORLD_TEXT);
    setTextSelection(mounted.view, 8);

    expect(deleteWordForward(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(" Hello ");
  });
});
