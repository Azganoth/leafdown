import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppCommands } from "@/commands";
import { getEditorCommandState, runEditorCommand, type EditorCommandId } from "@/features/editor";
import { resetActiveDocumentEditorBridge, setActiveDocumentEditorBridge } from "@/features/session";
import { resetAppStores, setDefaultSession } from "@/test/fixtures/appStores";
import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { dispatchKeyDown, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
import { render } from "@/test/utils/react";
import { CommandMenuBar } from "./CommandMenuBar";

const documentKey = "C:/Notes/readme.md";
const mountedEditors: MountedMilkdownEditor[] = [];

const mountActiveEditor = async (initialMarkdown: string) => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  const runCommand = vi.fn((commandId: EditorCommandId) =>
    runEditorCommand(mounted.editor, commandId),
  );

  mountedEditors.push(mounted);
  setDefaultSession({
    activeDocument: {
      status: "saved",
      path: documentKey,
      content: initialMarkdown,
      isDirty: false,
      lineEnding: "lf",
      metadata: { sizeBytes: initialMarkdown.length, modifiedAtUnixMs: 1_773_916_800_000 },
    },
  });
  setActiveDocumentEditorBridge(documentKey, {
    getMarkdown: mounted.getMarkdown,
    getCommandState: () => getEditorCommandState(mounted.view),
    runCommand,
  });

  return { mounted, runCommand };
};

function ControlledCommandMenuBar() {
  const commands = useAppCommands();

  return (
    <CommandMenuBar
      commandState={commands.commandState}
      onExecute={commands.executeCommand}
      onOpenRecentFile={commands.openRecentFile}
      onOpenRecentFolder={commands.openRecentFolder}
      recentFiles={commands.history.recentFiles}
      recentFolders={commands.history.recentFolders}
    />
  );
}

describe("CommandMenuBar editor keyboard routing", () => {
  beforeEach(() => {
    resetAppStores();
    resetActiveDocumentEditorBridge();
  });

  afterEach(async () => {
    resetActiveDocumentEditorBridge();
    resetAppStores();
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("routes app-owned shortcuts from real editor keydown events", async () => {
    const { mounted, runCommand } = await mountActiveEditor("First\n\nSecond");

    render(<ControlledCommandMenuBar />);
    setSelectionAtDocumentEnd(mounted.view);

    const jumpShortcut = dispatchKeyDown(mounted.view, "Home", { ctrlKey: true });

    expect(jumpShortcut.defaultPrevented).toBe(true);
    expect(runCommand).toHaveBeenCalledWith("edit.jumpToTop");
    expect(mounted.view.state.selection.from).toBe(1);
  });

  it("does not route disabled editor shortcuts from real editor keydown events", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Hello");

    render(<ControlledCommandMenuBar />);

    const copyShortcut = dispatchKeyDown(mounted.view, "c", { ctrlKey: true });

    expect(copyShortcut.defaultPrevented).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("does not reroute shortcuts already handled by the editor", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Hello");

    render(<ControlledCommandMenuBar />);
    setSelectionAtDocumentEnd(mounted.view);

    const selectAllShortcut = dispatchKeyDown(mounted.view, "a", { ctrlKey: true });

    expect(selectAllShortcut.defaultPrevented).toBe(true);
    expect(mounted.view.state.selection.from).toBe(0);
    expect(mounted.view.state.selection.to).toBe(mounted.view.state.doc.content.size);
    expect(runCommand).not.toHaveBeenCalled();
  });
});
