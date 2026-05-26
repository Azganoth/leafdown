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

    setTextSelection(mounted.view, 3);

    expect(runEditorCommand(mounted.editor, "edit.delete")).toBe(true);
    expect(textContent(mounted)).toBe("Helo world");

    setTextSelection(mounted.view, 1, 5);

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

  it("toggles inline formatting for selections and nearest words", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "format.strong")).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("Hello");
    expect(mounted.getMarkdown()).toContain("**Hello** world");

    expect(runEditorCommand(mounted.editor, "format.strong")).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();

    setTextSelection(mounted.view, 8);

    expect(runEditorCommand(mounted.editor, "format.emphasis")).toBe(true);
    expect(mounted.view.dom.querySelector("em")).toHaveTextContent("world");

    expect(runEditorCommand(mounted.editor, "format.strikethrough")).toBe(true);
    expect(mounted.view.dom.querySelector("del")).toHaveTextContent("world");
  });

  it("uses inline code as exclusive inline formatting", async () => {
    const mounted = await mountEditor("**Hello** world");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "format.inlineCode")).toBe(true);
    expect(mounted.view.dom.querySelector("code")).toHaveTextContent("Hello");
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).toContain("`Hello` world");
  });

  it("clears selected and active inline formatting", async () => {
    const mounted = await mountEditor("**Hello** *world*");

    setTextSelection(mounted.view, 1, 6);

    expect(runEditorCommand(mounted.editor, "format.clearInline")).toBe(true);
    expect(mounted.view.dom.querySelector("strong")).not.toBeInTheDocument();
    expect(mounted.view.dom.querySelector("em")).toHaveTextContent("world");

    setTextSelection(mounted.view, 8);

    expect(runEditorCommand(mounted.editor, "format.clearInline")).toBe(true);
    expect(mounted.view.dom.querySelector("em")).not.toBeInTheDocument();
  });

  it("formats links semantically and inserts an empty link marker without a word", async () => {
    const selectedLinkEditor = await mountEditor("Hello");

    setTextSelection(selectedLinkEditor.view, 1, 6);

    expect(runEditorCommand(selectedLinkEditor.editor, "insert.link")).toBe(true);
    expect(selectedLinkEditor.view.dom.querySelector("a")).toHaveTextContent("Hello");
    expect(selectedLinkEditor.getMarkdown()).toContain("[Hello]()");

    const emptyLinkEditor = await mountEditor("");

    setTextSelection(emptyLinkEditor.view, 1);

    expect(runEditorCommand(emptyLinkEditor.editor, "insert.link")).toBe(true);
    expect(textContent(emptyLinkEditor)).toBe("[]()");
    expect(emptyLinkEditor.view.state.selection.from).toBe(2);
  });

  it("toggles paragraph, heading, blockquote, and code block formats", async () => {
    const mounted = await mountEditor("Hello");

    setTextSelection(mounted.view, 3);

    expect(runEditorCommand(mounted.editor, "format.heading2")).toBe(true);
    expect(mounted.view.dom.querySelector("h2")).toHaveTextContent("Hello");
    expect(mounted.getMarkdown()).toContain("## Hello");

    expect(runEditorCommand(mounted.editor, "format.heading2")).toBe(true);
    expect(mounted.view.dom.querySelector("h2")).not.toBeInTheDocument();

    expect(runEditorCommand(mounted.editor, "format.blockquote")).toBe(true);
    expect(mounted.view.dom.querySelector("blockquote")).toHaveTextContent("Hello");

    expect(runEditorCommand(mounted.editor, "format.clearBlock")).toBe(true);
    expect(mounted.view.dom.querySelector("blockquote")).not.toBeInTheDocument();

    expect(runEditorCommand(mounted.editor, "format.codeBlock")).toBe(true);
    expect(mounted.view.dom.querySelector("pre code")).toHaveTextContent("Hello");

    expect(runEditorCommand(mounted.editor, "format.paragraph")).toBe(true);
    expect(mounted.view.dom.querySelector("pre code")).not.toBeInTheDocument();
  });

  it("adjusts heading levels for selected heading blocks", async () => {
    const mounted = await mountEditor("# First\n\n### Second");

    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);
    expect(runEditorCommand(mounted.editor, "format.increaseHeading")).toBe(true);

    expect(mounted.getMarkdown()).toContain("## First");
    expect(mounted.getMarkdown()).toContain("#### Second");

    expect(runEditorCommand(mounted.editor, "format.decreaseHeading")).toBe(true);
    expect(mounted.getMarkdown()).toContain("# First");
    expect(mounted.getMarkdown()).toContain("### Second");
  });

  it("toggles list and task list formats", async () => {
    const mounted = await mountEditor("Item");

    setTextSelection(mounted.view, 2);

    expect(runEditorCommand(mounted.editor, "format.unorderedList")).toBe(true);
    expect(mounted.view.dom.querySelector("ul li")).toHaveTextContent("Item");

    expect(runEditorCommand(mounted.editor, "format.taskList")).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked='false']")).toHaveTextContent("Item");
    expect(mounted.getMarkdown()).toContain("* [ ] Item");

    expect(runEditorCommand(mounted.editor, "format.toggleTaskChecked")).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked='true']")).toHaveTextContent("Item");
    expect(mounted.getMarkdown()).toContain("* [x] Item");

    expect(runEditorCommand(mounted.editor, "format.taskList")).toBe(true);
    expect(mounted.view.dom.querySelector("li[data-checked]")).not.toBeInTheDocument();
  });

  it("indents and outdents list items through formatting commands", async () => {
    const mounted = await mountEditor("- First\n- Second");
    const listItems = mounted.view.dom.querySelectorAll("li");

    expect(listItems).toHaveLength(2);

    setTextSelection(mounted.view, mounted.view.posAtDOM(listItems[1], 0));

    expect(runEditorCommand(mounted.editor, "format.increaseListIndent")).toBe(true);
    expect(mounted.view.dom.querySelectorAll("ul ul li")).toHaveLength(1);

    expect(runEditorCommand(mounted.editor, "format.decreaseListIndent")).toBe(true);
    expect(mounted.view.dom.querySelectorAll("ul > li")).toHaveLength(2);
  });

  it("toggles rendered task checkboxes by clicking their checkbox area", async () => {
    const mounted = await mountEditor("- [ ] Todo");
    const taskListItem = mounted.view.dom.querySelector("li[data-checked='false']");

    expect(taskListItem).toBeInTheDocument();

    taskListItem?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: 1,
        clientY: 1,
      }),
    );

    expect(mounted.view.dom.querySelector("li[data-checked='true']")).toHaveTextContent("Todo");
    expect(mounted.getMarkdown()).toContain("* [x] Todo");
  });
});
