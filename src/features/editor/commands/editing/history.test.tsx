import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  setSelectionAtDocumentEnd,
  typeText,
} from "@/test/utils/prosemirror";

import { canRedo, canUndo, redo, undo } from "./history";

const mountEditor = setupMilkdownEditorMount();

describe("editor history commands", () => {
  it("runs undo and redo through editor history", async () => {
    const mounted = await mountEditor("Hello");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");

    expect(canRedo(mounted.view.state)).toBe(false);
    expect(canUndo(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("Hello!");

    expect(undo(mounted.view)).toBe(true);
    expect(canRedo(mounted.view.state)).toBe(true);
    expect(canUndo(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe("Hello");

    expect(redo(mounted.view)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("Hello!");
  });
});
