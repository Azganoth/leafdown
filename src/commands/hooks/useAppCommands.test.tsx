// @vitest-environment happy-dom

import { getCurrentWindow } from "@tauri-apps/api/window";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getEditorCommandState, runEditorCommand, type EditorCommandId } from "@/features/editor";
import { INACTIVE_EDITOR_COMMAND_STATE } from "@/features/editor/commands/contract";
import { documentEditorBridge, useSessionStore } from "@/features/session";
import { toastManager } from "@/lib/toast";
import { createSavedDocument } from "@/test/factories/document";
import { createMilkdownEditorBridge } from "@/test/factories/editor";
import { createFolderContext } from "@/test/factories/folderContext";
import { TEST_MARKDOWN_FILE_PATH } from "@/test/fixtures/paths";
import { setDefaultSession } from "@/test/utils/appStores";
import { dispatchKeyDown, type TestKeyboardEventOptions } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import { setSelectionInTableCell, setTextSelection } from "@/test/utils/prosemirror";
import { act, render, renderHook, waitFor } from "@/test/utils/react";

import { APPLICATION_COMMANDS } from "../application";
import { useAppCommands } from "./useAppCommands";

const mountEditor = setupMilkdownEditorMount();

function AppCommandsHarness() {
  useAppCommands();

  return null;
}

const mountEditorBridge = async (initialMarkdown: string) => {
  let commandState = INACTIVE_EDITOR_COMMAND_STATE;
  const mounted = await mountEditor(initialMarkdown, {
    onCommandStateChanged: (nextCommandState) => {
      commandState = nextCommandState;
      documentEditorBridge.fireCommandStateChanged();
    },
  });
  const runCommand = vi.fn((commandId: EditorCommandId) =>
    runEditorCommand(mounted.editor, commandId),
  );

  commandState = getEditorCommandState(mounted.view);

  const bridge = createMilkdownEditorBridge({
    getCommandState: () => commandState,
    getMarkdown: mounted.getMarkdown,
    runCommand,
  });

  return { bridge, mounted, runCommand };
};

const mountActiveEditor = async (initialMarkdown: string) => {
  const { bridge, mounted, runCommand } = await mountEditorBridge(initialMarkdown);

  setDefaultSession({
    activeDocument: createSavedDocument({
      content: initialMarkdown,
    }),
  });
  documentEditorBridge.set(TEST_MARKDOWN_FILE_PATH, bridge);

  return { mounted, runCommand };
};

describe("useAppCommands command state", () => {
  beforeEach(() => {
    documentEditorBridge.clear();
  });

  afterEach(() => {
    documentEditorBridge.clear();
  });

  it("follows editor command state changes while the active document stays the same", async () => {
    const markdown = "Hello\n\n| A | B |\n| - | - |\n| C | D |\n";

    setDefaultSession({ activeDocument: createSavedDocument({ content: markdown }) });

    const { result } = renderHook(() => useAppCommands());
    const activeDocument = useSessionStore.getState().activeDocument;

    expect(result.current.commandState("format.strong").enabled).toBe(false);

    const { bridge, mounted } = await mountEditorBridge(markdown);

    act(() => {
      documentEditorBridge.set(TEST_MARKDOWN_FILE_PATH, bridge);
    });

    expect(result.current.commandState("format.strong").enabled).toBe(true);
    expect(result.current.commandState("format.table.addRowBelow").enabled).toBe(false);

    act(() => {
      setSelectionInTableCell(mounted, 1, 0);
    });

    expect(result.current.commandState("format.table.addRowBelow").enabled).toBe(true);

    act(() => {
      setTextSelection(mounted.view, 1);
    });

    expect(result.current.commandState("format.table.addRowBelow").enabled).toBe(false);
    expect(useSessionStore.getState().activeDocument).toBe(activeDocument);
  });
});

describe("useAppCommands shortcut routing", () => {
  beforeEach(() => {
    documentEditorBridge.clear();
  });

  afterEach(() => {
    documentEditorBridge.clear();
  });

  it("leaves editor-owned shortcuts to the editor event pipeline", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Hello");

    render(<AppCommandsHarness />);
    setTextSelection(mounted.view, 1, 6);

    const event = dispatchKeyDown(mounted.view.dom, "b", { ctrl: true, keyCode: 66 });

    expect(event.defaultPrevented).toBe(true);
    expect(runCommand).not.toHaveBeenCalled();
    expect(mounted.view.state.doc.textContent).toBe("**Hello**");
    expect(mounted.getMarkdown()).toBe("**Hello**\n");
  });

  it.each([
    ["copy", "c", { ctrl: true }],
    ["cut", "x", { ctrl: true }],
    ["paste", "v", { ctrl: true }],
    ["paste as plain text", "v", { ctrl: true, shift: true }],
    ["select all", "a", { ctrl: true }],
    ["undo", "z", { ctrl: true }],
    ["inline formatting", "b", { ctrl: true }],
    ["task formatting", "9", { alt: true, ctrl: true }],
    ["delete", "Delete", {}],
    ["line start", "Home", {}],
    ["line end", "End", {}],
  ] satisfies Array<[string, string, TestKeyboardEventOptions]>)(
    "does not claim %s in an external text input",
    async (_, key, modifiers) => {
      const { runCommand } = await mountActiveEditor("Hello");
      const input = document.createElement("textarea");

      document.body.append(input);
      render(<AppCommandsHarness />);

      try {
        const event = dispatchKeyDown(input, key, modifiers);

        expect(event.defaultPrevented).toBe(false);
        expect(runCommand).not.toHaveBeenCalled();
      } finally {
        input.remove();
      }
    },
  );

  it.each([
    ["copy", "c", { ctrl: true }],
    ["cut", "x", { ctrl: true }],
    ["paste", "v", { ctrl: true }],
    ["paste as plain text", "v", { ctrl: true, shift: true }],
  ] satisfies Array<[string, string, TestKeyboardEventOptions]>)(
    "leaves the native %s gesture unclaimed in the editor",
    async (_, key, modifiers) => {
      const { mounted, runCommand } = await mountActiveEditor("Hello");

      render(<AppCommandsHarness />);

      const event = dispatchKeyDown(mounted.view.dom, key, modifiers);

      expect(event.defaultPrevented).toBe(false);
      expect(runCommand).not.toHaveBeenCalled();
    },
  );

  it("does not claim editor or native shortcuts in an editor-surface input", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Text");

    render(<AppCommandsHarness />);
    const input = document.createElement("input");
    mounted.root.append(input);
    const formatEvent = dispatchKeyDown(input, "b", { ctrl: true });
    const copyEvent = dispatchKeyDown(input, "c", { ctrl: true });
    input.remove();

    expect(formatEvent.defaultPrevented).toBe(false);
    expect(copyEvent.defaultPrevented).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("continues to route application shortcuts from text inputs", async () => {
    const originalRun = APPLICATION_COMMANDS["view.toggleSidebar"].run;
    const run = vi.fn();
    const input = document.createElement("textarea");

    APPLICATION_COMMANDS["view.toggleSidebar"].run = run;
    document.body.append(input);
    setDefaultSession({ folderContext: createFolderContext() });

    try {
      render(<AppCommandsHarness />);

      const event = dispatchKeyDown(input, "e", { ctrl: true, shift: true });

      expect(event.defaultPrevented).toBe(true);
      expect(run).toHaveBeenCalledOnce();
    } finally {
      APPLICATION_COMMANDS["view.toggleSidebar"].run = originalRun;
      input.remove();
    }
  });

  it.each([
    ["s", { ctrl: true }],
    ["S", { ctrl: true, shift: true }],
    ["w", { ctrl: true }],
  ] satisfies Array<[string, TestKeyboardEventOptions]>)(
    "suppresses disabled file shortcut %s",
    (key, init) => {
      render(<AppCommandsHarness />);

      const event = dispatchKeyDown(window, key, init);

      expect(event.defaultPrevented).toBe(true);
    },
  );

  it.each([
    ["r", { ctrl: true }],
    ["F5", {}],
    ["ArrowLeft", { alt: true }],
    ["ArrowRight", { alt: true }],
  ] satisfies Array<[string, TestKeyboardEventOptions]>)(
    "suppresses reserved webview shortcut %s",
    (key, init) => {
      render(<AppCommandsHarness />);

      expect(dispatchKeyDown(window, key, init).defaultPrevented).toBe(true);
    },
  );

  it("routes Alt+F4 through application shortcut metadata", () => {
    const closeWindow = vi.mocked(getCurrentWindow().close);
    closeWindow.mockClear();

    render(<AppCommandsHarness />);

    const event = dispatchKeyDown(window, "F4", { alt: true });

    expect(event.defaultPrevented).toBe(true);
    expect(closeWindow).toHaveBeenCalledOnce();
  });

  it("reports rejected application command executions", async () => {
    const originalRun = APPLICATION_COMMANDS["file.new"].run;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = new Error("failed");

    APPLICATION_COMMANDS["file.new"].run = vi.fn(async () => {
      throw error;
    });

    try {
      render(<AppCommandsHarness />);

      const event = dispatchKeyDown(window, "n", { ctrl: true });

      expect(event.defaultPrevented).toBe(true);
      await waitFor(() => {
        expect(toastManager.add).toHaveBeenCalledWith({
          description: "failed",
          title: "Command failed.",
          type: "error",
        });
        expect(consoleError).toHaveBeenCalledWith("Unexpected error (commands: file.new).", error);
      });
    } finally {
      APPLICATION_COMMANDS["file.new"].run = originalRun;
    }
  });
});
