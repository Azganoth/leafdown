import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setSelectionAtDocumentEnd, setTextSelection, typeText } from "@/test/utils/prosemirror";
import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

import { runEditorCommand } from "./editorCommands";

const mountedEditors: MountedMilkdownEditor[] = [];
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");

const clipboard = {
  read: vi.fn<() => Promise<ClipboardItem[]>>(),
  readText: vi.fn<() => Promise<string>>(),
  write: vi.fn<(data: ClipboardItem[]) => Promise<void>>(),
  writeText: vi.fn<(text: string) => Promise<void>>(),
};

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  mountedEditors.push(mounted);
  return mounted;
};

const textContent = (mounted: MountedMilkdownEditor) => mounted.view.state.doc.textContent;
const textSelectionStart = 1;

const createClipboardItem = (type: string, value: string): ClipboardItem =>
  ({
    types: [type],
    getType: vi.fn(async () => new Blob([value], { type })),
  }) as unknown as ClipboardItem;

describe("editor commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    clipboard.read.mockResolvedValue([]);
    clipboard.readText.mockResolvedValue("");
    clipboard.write.mockResolvedValue(undefined);
    clipboard.writeText.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));

    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("runs undo and redo through editor history", async () => {
    const mounted = await mountEditor("Hello");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");

    expect(textContent(mounted)).toBe("Hello!");

    expect(runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(textContent(mounted)).toBe("Hello");

    expect(runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(textContent(mounted)).toBe("Hello!");
  });

  it("deletes selections and words around the caret", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "edit.delete")).toBe(true);
    expect(textContent(mounted)).toBe(" world");

    setSelectionAtDocumentEnd(mounted.view);

    expect(runEditorCommand(mounted.editor, "edit.deleteWordBackward")).toBe(true);
    expect(textContent(mounted)).toBe(" ");

    typeText(mounted.view, "Hello world");
    setTextSelection(mounted.view, 8);

    expect(runEditorCommand(mounted.editor, "edit.deleteWordForward")).toBe(true);
    expect(textContent(mounted)).toBe(" Hello ");
  });

  it("selects all content and the active word", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 3);

    expect(runEditorCommand(mounted.editor, "edit.selectWord")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);

    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(0);
    expect(mounted.view.state.selection.to).toBe(mounted.view.state.doc.content.size);
  });

  it("jumps to document and line boundaries", async () => {
    const mounted = await mountEditor("First\n\nSecond");

    setSelectionAtDocumentEnd(mounted.view);

    expect(runEditorCommand(mounted.editor, "edit.jumpToTop")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(textSelectionStart);

    expect(runEditorCommand(mounted.editor, "edit.jumpToBottom")).toBe(true);
    const documentEnd = mounted.view.state.selection.from;

    expect(documentEnd).toBeGreaterThan(textSelectionStart);

    expect(runEditorCommand(mounted.editor, "edit.jumpToLineStart")).toBe(true);
    expect(mounted.view.state.selection.from).toBeLessThan(documentEnd);

    expect(runEditorCommand(mounted.editor, "edit.jumpToLineEnd")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(documentEnd);
  });

  it("scrolls the active selection without changing it", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "edit.jumpToSelection")).toBe(true);
    expect(mounted.view.state.selection.from).toBe(1);
    expect(mounted.view.state.selection.to).toBe(6);
  });

  it("copies selections in plain text and Markdown formats", async () => {
    const mounted = await mountEditor("**Bold** plain");

    setTextSelection(mounted.view, 1, 5);

    await expect(runEditorCommand(mounted.editor, "edit.copyAsPlainText")).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenLastCalledWith("Bold");

    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);

    await expect(runEditorCommand(mounted.editor, "edit.copyAsMarkdown")).resolves.toBe(true);
    expect(clipboard.writeText).toHaveBeenLastCalledWith(expect.stringContaining("**Bold**"));
  });

  it("cuts the current selection after copying it", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    await expect(runEditorCommand(mounted.editor, "edit.cut")).resolves.toBe(true);

    expect(clipboard.writeText).toHaveBeenCalledWith("Hello");
    expect(textContent(mounted)).toBe(" world");
  });

  it("pastes plain text literally and Markdown as editor content", async () => {
    const plainTextEditor = await mountEditor("");

    clipboard.readText.mockResolvedValue("**Bold**");

    await expect(runEditorCommand(plainTextEditor.editor, "edit.pasteAsPlainText")).resolves.toBe(
      true,
    );

    expect(plainTextEditor.view.dom).toHaveTextContent("**Bold**");
    expect(plainTextEditor.view.dom.querySelector("strong")).not.toBeInTheDocument();

    const markdownEditor = await mountEditor("");

    clipboard.readText.mockResolvedValue("**Bold**");

    await expect(runEditorCommand(markdownEditor.editor, "edit.pasteAsMarkdown")).resolves.toBe(
      true,
    );

    expect(markdownEditor.view.dom).toHaveTextContent("Bold");
    expect(markdownEditor.view.dom.querySelector("strong")).toBeInTheDocument();
  });

  it("pastes rich text from clipboard HTML when available", async () => {
    const mounted = await mountEditor("");

    clipboard.read.mockResolvedValue([
      createClipboardItem("text/html", "<p><strong>Rich</strong> text</p>"),
    ]);

    await expect(runEditorCommand(mounted.editor, "edit.pasteAsRichText")).resolves.toBe(true);

    expect(mounted.view.dom).toHaveTextContent("Rich text");
    expect(mounted.view.dom.querySelector("strong")).toBeInTheDocument();
  });
});
