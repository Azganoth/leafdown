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
import { setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
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
