import { afterEach, describe, expect, it } from "vitest";

import { setSelectionAtDocumentEnd, setTextSelection, typeText } from "@/test/utils/prosemirror";
import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

import { runEditorCommand } from "./editorCommands";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  mountedEditors.push(mounted);
  return mounted;
};

const textContent = (mounted: MountedMilkdownEditor) => mounted.view.state.doc.textContent;
const textSelectionStart = 1;

describe("editor commands", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("runs undo and redo through editor history", async () => {
    const mounted = await mountEditor("Hello");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");

    expect(textContent(mounted)).toBe("Hello!");

    expect(runEditorCommand(mounted.view, "edit.undo")).toBe(true);
    expect(textContent(mounted)).toBe("Hello");

    expect(runEditorCommand(mounted.view, "edit.redo")).toBe(true);
    expect(textContent(mounted)).toBe("Hello!");
  });

  it("deletes selections and words around the caret", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.view, "edit.delete")).toBe(true);
    expect(textContent(mounted)).toBe(" world");

    setSelectionAtDocumentEnd(mounted.view);

    expect(runEditorCommand(mounted.view, "edit.deleteWordBackward")).toBe(true);
    expect(textContent(mounted)).toBe(" ");

    typeText(mounted.view, "Hello world");
    setTextSelection(mounted.view, 8);

    expect(runEditorCommand(mounted.view, "edit.deleteWordForward")).toBe(true);
    expect(textContent(mounted)).toBe(" Hello ");
  });

  it("selects all content and the active word", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 3);

    expect(runEditorCommand(mounted.view, "edit.selectWord")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);

    expect(runEditorCommand(mounted.view, "edit.selectAll")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(0);
    expect(mounted.view.state.selection.to).toBe(mounted.view.state.doc.content.size);
  });

  it("jumps to document and line boundaries", async () => {
    const mounted = await mountEditor("First\n\nSecond");

    setSelectionAtDocumentEnd(mounted.view);

    expect(runEditorCommand(mounted.view, "edit.jumpToTop")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(textSelectionStart);

    expect(runEditorCommand(mounted.view, "edit.jumpToBottom")).toBe(true);
    const documentEnd = mounted.view.state.selection.from;

    expect(documentEnd).toBeGreaterThan(textSelectionStart);

    expect(runEditorCommand(mounted.view, "edit.jumpToLineStart")).toBe(true);
    expect(mounted.view.state.selection.from).toBeLessThan(documentEnd);

    expect(runEditorCommand(mounted.view, "edit.jumpToLineEnd")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(documentEnd);
  });

  it("scrolls the active selection without changing it", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.view, "edit.jumpToSelection")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);
  });
});
