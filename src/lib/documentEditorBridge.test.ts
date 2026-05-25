import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getActiveDocumentEditorCommandState,
  getActiveDocumentEditorCommandStateVersion,
  inactiveEditorCommandState,
  notifyActiveDocumentEditorCommandStateChanged,
  resetActiveDocumentEditorBridge,
  runActiveDocumentEditorCommand,
  setActiveDocumentEditorBridge,
  subscribeActiveDocumentEditorCommandState,
} from "./documentEditorBridge";

describe("document editor bridge", () => {
  afterEach(() => {
    resetActiveDocumentEditorBridge();
  });

  it("notifies subscribers when the active editor bridge changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveDocumentEditorCommandState(listener);
    const initialVersion = getActiveDocumentEditorCommandStateVersion();

    setActiveDocumentEditorBridge("doc:test", {
      getMarkdown: () => "Hello",
      getCommandState: () => ({
        enabledCommands: { "edit.selectAll": true },
        hasActiveEditor: true,
        hasSelection: false,
        hasTableSelection: false,
      }),
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getActiveDocumentEditorCommandStateVersion()).toBeGreaterThan(initialVersion);
    expect(getActiveDocumentEditorCommandState("doc:test").enabledCommands["edit.selectAll"]).toBe(
      true,
    );

    unsubscribe();
    notifyActiveDocumentEditorCommandStateChanged();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns inactive command state for stale document keys", () => {
    setActiveDocumentEditorBridge("doc:test", {
      getMarkdown: () => "Hello",
      getCommandState: () => ({
        enabledCommands: { "edit.selectAll": true },
        hasActiveEditor: true,
        hasSelection: false,
        hasTableSelection: false,
      }),
    });

    expect(getActiveDocumentEditorCommandState("doc:other")).toEqual(inactiveEditorCommandState);
  });

  it("runs commands only against the active editor bridge", () => {
    const runCommand = vi.fn(() => true);

    setActiveDocumentEditorBridge("doc:test", {
      getMarkdown: () => "Hello",
      runCommand,
    });

    expect(runActiveDocumentEditorCommand("doc:test", "edit.selectAll")).toBe(true);
    expect(runCommand).toHaveBeenCalledWith("edit.selectAll");

    expect(runActiveDocumentEditorCommand("doc:other", "edit.selectAll")).toBe(false);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });
});
