import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runEditorCommand } from "@/features/editor";
import { getEditorCommandState } from "@/features/editor/utils/editorCommandState";
import {
  setActiveDocumentEditorBridge,
  resetActiveDocumentEditorBridge,
} from "@/lib/documentEditorBridge";
import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { dispatchKeyDown, setSelectionAtDocumentEnd } from "@/test/utils/prosemirror";
import { render } from "@/test/utils/react";
import { resetAppStores, setDefaultSession } from "@/test/utils/stores";
import type { AppCommandId } from "../types";

import { CommandMenuBar } from "./CommandMenuBar";

const documentKey = "C:/Notes/readme.md";
const mountedEditors: MountedMilkdownEditor[] = [];

const mountActiveEditor = async (initialMarkdown: string) => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  const runCommand = vi.fn((commandId: AppCommandId) =>
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

    render(<CommandMenuBar />);
    setSelectionAtDocumentEnd(mounted.view);

    const jumpShortcut = dispatchKeyDown(mounted.view, "Home", { ctrlKey: true });

    expect(jumpShortcut.defaultPrevented).toBe(true);
    expect(runCommand).toHaveBeenCalledWith("edit.jumpToTop");
    expect(mounted.view.state.selection.from).toBe(1);
  });

  it("does not route disabled editor shortcuts from real editor keydown events", async () => {
    const { mounted, runCommand } = await mountActiveEditor("Hello");

    render(<CommandMenuBar />);

    const copyShortcut = dispatchKeyDown(mounted.view, "c", { ctrlKey: true });

    expect(copyShortcut.defaultPrevented).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
  });
});
