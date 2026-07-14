import { getCurrentWindow } from "@tauri-apps/api/window";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getEditorCommandState, runEditorCommand, type EditorCommandId } from "@/features/editor";
import { documentEditorBridge } from "@/features/session";
import { createSavedDocument } from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";
import { setDefaultSession } from "@/test/utils/appStores";
import { dispatchKeyDown, type TestKeyboardEventOptions } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorDomElement,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  setSelectionAtDocumentEnd,
  setSelectionAtElementTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { render, waitFor } from "@/test/utils/react";

import { APPLICATION_COMMANDS } from "../application";
import { useAppCommands } from "./useAppCommands";

const mountEditor = setupMilkdownEditorMount();

function AppCommandsHarness() {
  useAppCommands();

  return null;
}

const mountActiveEditor = async (initialMarkdown: string) => {
  const mounted = await mountEditor(initialMarkdown);
  const runCommand = vi.fn((commandId: EditorCommandId) =>
    runEditorCommand(mounted.editor, commandId),
  );

  setDefaultSession({
    activeDocument: createSavedDocument({
      content: initialMarkdown,
    }),
  });
  documentEditorBridge.set(
    TEST_MARKDOWN_FILE_PATH,
    createMilkdownEditorBridge({
      getCommandState: () => getEditorCommandState(mounted.view),
      getMarkdown: mounted.getMarkdown,
      runCommand,
    }),
  );

  return { mounted, runCommand };
};

describe("useAppCommands shortcut routing", () => {
  beforeEach(() => {
    documentEditorBridge.clear();
  });

  afterEach(() => {
    documentEditorBridge.clear();
  });

  it("routes app-owned shortcuts from real editor keydown events", async () => {
    const { mounted, runCommand } = await mountActiveEditor("First\n\nSecond");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const jumpShortcut = dispatchKeyDown(mounted.view.dom, "Home", { ctrl: true });

    expect(jumpShortcut.defaultPrevented).toBe(true);
    expect(runCommand).toHaveBeenCalledWith("edit.jumpToTop");
    expect(mounted.view.state.selection.from).toBe(1);
  });

  it("does not route disabled editor shortcuts from real editor keydown events", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Hello");

    render(<AppCommandsHarness />);

    const copyShortcut = dispatchKeyDown(mounted.view.dom, "c", { ctrl: true });

    expect(copyShortcut.defaultPrevented).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("does not reroute shortcuts already handled by the editor", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Hello");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const selectAllShortcut = dispatchKeyDown(mounted.view.dom, "a", { ctrl: true });

    expect(selectAllShortcut.defaultPrevented).toBe(true);
    expect(mounted.view.state.selection.from).toBe(0);
    expect(mounted.view.state.selection.to).toBe(mounted.view.state.doc.content.size);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it.each([
    {
      commandId: "format.strong" as const,
      expectedMarkdown: "*Single* ***asterisk*** *emphasis*\n",
      key: "b",
      keyCode: 66,
      modifiers: { ctrl: true },
    },
    {
      commandId: "format.emphasis" as const,
      expectedMarkdown: "*Single* asterisk *emphasis*\n",
      key: "i",
      keyCode: 73,
      modifiers: { ctrl: true },
    },
    {
      commandId: "format.strikethrough" as const,
      expectedMarkdown: "*Single* *~~asterisk~~* *emphasis*\n",
      key: "x",
      keyCode: 88,
      modifiers: { alt: true, ctrl: true },
    },
    {
      commandId: "format.inlineCode" as const,
      expectedMarkdown: "*Single* `asterisk` *emphasis*\n",
      key: "e",
      keyCode: 69,
      modifiers: { ctrl: true },
    },
  ])(
    "lets the editor route $commandId without duplicate app dispatch",
    async ({ expectedMarkdown, key, keyCode, modifiers }) => {
      const { mounted, runCommand } = await mountActiveEditor("*Single asterisk emphasis*");

      render(<AppCommandsHarness />);

      const selectionFrom = getEditorTextPosition(mounted, "asterisk");

      setTextSelection(mounted.view, selectionFrom, selectionFrom + "asterisk".length);

      expect(getEditorTextContent(mounted)).toBe("*Single asterisk emphasis*");
      expect(getSelectedEditorText(mounted)).toBe("asterisk");

      const shortcut = dispatchKeyDown(mounted.view.dom, key, { ...modifiers, keyCode });

      expect(shortcut.defaultPrevented).toBe(true);
      expect(runCommand).not.toHaveBeenCalled();
      expect(getSelectedEditorText(mounted)).toBe("asterisk");
      expect(mounted.getMarkdown()).toBe(expectedMarkdown);
    },
  );

  it("routes projected link history without moving the selection or dispatching twice", async () => {
    const { mounted, runCommand } = await mountActiveEditor("[text in link](./link)");

    render(<AppCommandsHarness />);

    const selectionFrom = getEditorTextPosition(mounted, "in");

    setTextSelection(mounted.view, selectionFrom, selectionFrom + "in".length);

    dispatchKeyDown(mounted.view.dom, "b", { ctrl: true, keyCode: 66 });
    expect(getEditorTextContent(mounted)).toBe("[text **in** link](./link)");

    const undoShortcut = dispatchKeyDown(mounted.view.dom, "z", { ctrl: true, keyCode: 90 });

    expect(undoShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(getEditorTextContent(mounted)).toBe("[text in link](./link)");
    expect(getSelectedEditorText(mounted)).toBe("in");
    expect(mounted.getMarkdown()).toBe("[text in link](./link)\n");
  });

  it("preserves escaped link-label text through keyboard undo and redo", async () => {
    const initialMarkdown = "[\\*](./link)";
    const formattedMarkdown = "**[\\*](./link)**";
    const { mounted, runCommand } = await mountActiveEditor(initialMarkdown);

    render(<AppCommandsHarness />);

    const selectionFrom = getEditorTextPosition(mounted, "*");

    setTextSelection(mounted.view, selectionFrom, selectionFrom + 1);

    const formatShortcut = dispatchKeyDown(mounted.view.dom, "b", { ctrl: true, keyCode: 66 });

    expect(formatShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(getEditorTextContent(mounted)).toBe(formattedMarkdown);
    expect(getSelectedEditorText(mounted)).toBe("\\*");

    const undoShortcut = dispatchKeyDown(mounted.view.dom, "z", { ctrl: true, keyCode: 90 });

    expect(undoShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(getEditorTextContent(mounted)).toBe(initialMarkdown);
    expect(getSelectedEditorText(mounted)).toBe("\\*");

    const redoShortcut = dispatchKeyDown(mounted.view.dom, "y", { ctrl: true, keyCode: 89 });

    expect(redoShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(getEditorTextContent(mounted)).toBe(formattedMarkdown);
    expect(getSelectedEditorText(mounted)).toBe("\\*");
    expect(mounted.getMarkdown()).toBe(`${formattedMarkdown}\n`);
  });

  it.each([
    ["Mod-y", "y", { ctrl: true, keyCode: 89 }],
    ["Shift-Mod-z", "z", { ctrl: true, keyCode: 90, shift: true }],
  ] satisfies Array<[string, string, TestKeyboardEventOptions]>)(
    "routes projection-local redo through %s",
    async (_, key, modifiers) => {
      const { mounted, runCommand } = await mountActiveEditor("**Bold** plain");

      render(<AppCommandsHarness />);
      setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));
      typeText(mounted.view, "er");

      expect(getEditorTextContent(mounted)).toBe("**Bolder** plain");

      dispatchKeyDown(mounted.view.dom, "z", { ctrl: true, keyCode: 90 });
      expect(getEditorTextContent(mounted)).toBe("**Bolde** plain");

      const redoShortcut = dispatchKeyDown(mounted.view.dom, key, modifiers);

      expect(redoShortcut.defaultPrevented).toBe(true);
      expect(runCommand).not.toHaveBeenCalled();
      expect(getEditorTextContent(mounted)).toBe("**Bolder** plain");
    },
  );

  it("finalizes a clean projection before routing native undo", async () => {
    const { mounted, runCommand } = await mountActiveEditor("**Bold** plain");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");
    setSelectionAtElementTextEnd(mounted.view, getEditorDomElement(mounted, "strong"));

    expect(getEditorTextContent(mounted)).toBe("**Bold** plain!");

    const undoShortcut = dispatchKeyDown(mounted.view.dom, "z", { ctrl: true, keyCode: 90 });

    expect(undoShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(getEditorTextContent(mounted)).toBe("Bold plain");
    expect(mounted.getMarkdown()).toBe("**Bold** plain\n");
  });

  it("consumes an owned history shortcut when no history is available", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Hello");

    render(<AppCommandsHarness />);

    const undoShortcut = dispatchKeyDown(mounted.view.dom, "z", { ctrl: true, keyCode: 90 });

    expect(undoShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe("Hello\n");
  });

  it("routes an active heading shortcut through its toggle command", async () => {
    const { mounted, runCommand } = await mountActiveEditor("## Heading");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const headingShortcut = dispatchKeyDown(mounted.view.dom, "2", {
      alt: true,
      ctrl: true,
      keyCode: 50,
    });

    expect(headingShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.view.dom.querySelector("h2")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).toBe("Heading\n");
  });

  it("routes the paragraph shortcut through the Leafdown command", async () => {
    const { mounted, runCommand } = await mountActiveEditor("### Heading");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const paragraphShortcut = dispatchKeyDown(mounted.view.dom, "0", {
      alt: true,
      ctrl: true,
      keyCode: 48,
    });

    expect(paragraphShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.view.dom.querySelector("h3")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).toBe("Heading\n");
  });

  it("routes a heading shortcut across a multi-block selection", async () => {
    const { mounted, runCommand } = await mountActiveEditor("First\n\nSecond");

    render(<AppCommandsHarness />);
    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);

    const headingShortcut = dispatchKeyDown(mounted.view.dom, "3", {
      alt: true,
      ctrl: true,
      keyCode: 51,
    });

    expect(headingShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.view.dom.querySelectorAll("h3")).toHaveLength(2);
    expect(mounted.getMarkdown()).toBe("### First\n\n### Second\n");
  });

  it("routes list conversion and lifting through the ordered-list command", async () => {
    const { mounted, runCommand } = await mountActiveEditor("- Item");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const convertShortcut = dispatchKeyDown(mounted.view.dom, "7", {
      alt: true,
      ctrl: true,
      keyCode: 55,
    });

    expect(convertShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe("1. Item\n");

    const liftShortcut = dispatchKeyDown(mounted.view.dom, "7", {
      alt: true,
      ctrl: true,
      keyCode: 55,
    });

    expect(liftShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.getMarkdown()).toBe("Item\n");
  });

  it("routes an unordered-list shortcut across a multi-block selection", async () => {
    const { mounted, runCommand } = await mountActiveEditor("First\n\nSecond");

    render(<AppCommandsHarness />);
    expect(runEditorCommand(mounted.editor, "edit.selectAll")).toBe(true);

    const listShortcut = dispatchKeyDown(mounted.view.dom, "8", {
      alt: true,
      ctrl: true,
      keyCode: 56,
    });

    expect(listShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.view.dom.querySelectorAll("ul > li")).toHaveLength(2);
    expect(mounted.getMarkdown()).toBe("* First\n* Second\n");
  });

  it("routes the active blockquote shortcut through its toggle command", async () => {
    const { mounted, runCommand } = await mountActiveEditor("> Quote");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const blockquoteShortcut = dispatchKeyDown(mounted.view.dom, "b", {
      ctrl: true,
      keyCode: 66,
      shift: true,
    });

    expect(blockquoteShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.view.dom.querySelector("blockquote")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).toBe("Quote\n");
  });

  it("routes the active code-block shortcut through its toggle command", async () => {
    const { mounted, runCommand } = await mountActiveEditor("```\nconst value = 1;\n```");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const codeBlockShortcut = dispatchKeyDown(mounted.view.dom, "c", {
      alt: true,
      ctrl: true,
      keyCode: 67,
    });

    expect(codeBlockShortcut.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.view.dom.querySelector("pre")).not.toBeInTheDocument();
    expect(mounted.getMarkdown()).toBe("const value = 1;\n");
  });

  it("routes the task-list format shortcut", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Task");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const taskListShortcut = dispatchKeyDown(mounted.view.dom, "9", { alt: true, ctrl: true });

    expect(taskListShortcut.defaultPrevented).toBe(true);
    expect(runCommand).toHaveBeenCalledWith("format.taskList");
    expect(mounted.getMarkdown()).toContain("* [ ] Task");
  });

  it("routes the task checked-state shortcut", async () => {
    const { mounted, runCommand } = await mountActiveEditor("- [ ] Task");

    render(<AppCommandsHarness />);
    setSelectionAtDocumentEnd(mounted.view);

    const toggleTaskShortcut = dispatchKeyDown(mounted.view.dom, "Enter", { ctrl: true });

    expect(toggleTaskShortcut.defaultPrevented).toBe(true);
    expect(runCommand).toHaveBeenCalledWith("format.toggleTaskChecked");
    expect(mounted.getMarkdown()).toContain("* [x] Task");
  });

  it.each([
    ["s", { ctrl: true }],
    ["S", { ctrl: true, shift: true }],
    ["w", { ctrl: true }],
  ] satisfies Array<[string, TestKeyboardEventOptions]>)(
    "suppresses disabled file shortcut %s",
    (key, init) => {
      render(<AppCommandsHarness />);

      const shortcut = dispatchKeyDown(window, key, init);

      expect(shortcut.defaultPrevented).toBe(true);
    },
  );

  it("routes Alt+F4 through command shortcut metadata", () => {
    const closeWindow = vi.mocked(getCurrentWindow().close);
    closeWindow.mockClear();

    render(<AppCommandsHarness />);

    const shortcut = dispatchKeyDown(window, "F4", { alt: true });

    expect(shortcut.defaultPrevented).toBe(true);
    expect(closeWindow).toHaveBeenCalledOnce();
  });

  it("reports rejected command executions", async () => {
    const originalRun = APPLICATION_COMMANDS["file.new"].run;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("failed");

    APPLICATION_COMMANDS["file.new"].run = vi.fn(async () => {
      throw error;
    });

    try {
      render(<AppCommandsHarness />);

      const shortcut = dispatchKeyDown(window, "n", { ctrl: true });

      expect(shortcut.defaultPrevented).toBe(true);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Command failed.", {
          description: "failed",
        });
        expect(consoleError).toHaveBeenCalledWith("Unexpected error (commands: file.new).", error);
      });
    } finally {
      APPLICATION_COMMANDS["file.new"].run = originalRun;
    }
  });
});
