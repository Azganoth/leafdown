import { afterEach, describe, expect, it, vi } from "vitest";

import { INACTIVE_EDITOR_COMMAND_STATE } from "@/features/editor/commands/contract";
import {
  createActiveEditorCommandState,
  createMilkdownEditorBridge,
} from "@/test/factories/editor";

import { documentEditorBridge } from "./documentEditorBridge";

describe("document editor bridge", () => {
  afterEach(() => {
    documentEditorBridge.clear();
  });

  it("fires command state change events when the active editor bridge changes", () => {
    const listener = vi.fn();
    const listenerDisposable = documentEditorBridge.onDidChangeCommandState(listener);
    const initialVersion = documentEditorBridge.getCommandStateVersion();

    documentEditorBridge.set(
      "doc:test",
      createMilkdownEditorBridge({
        getCommandState: () =>
          createActiveEditorCommandState({
            enabledCommandIds: ["edit.selectAll"],
          }),
      }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(documentEditorBridge.getCommandStateVersion()).toBeGreaterThan(initialVersion);
    expect(documentEditorBridge.getCommandState("doc:test").enabledCommands["edit.selectAll"]).toBe(
      true,
    );

    listenerDisposable.dispose();
    documentEditorBridge.fireCommandStateChanged();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns inactive command state for stale document keys", () => {
    documentEditorBridge.set(
      "doc:test",
      createMilkdownEditorBridge({
        getCommandState: () =>
          createActiveEditorCommandState({
            enabledCommandIds: ["edit.selectAll"],
          }),
      }),
    );

    expect(documentEditorBridge.getCommandState("doc:other")).toEqual(
      INACTIVE_EDITOR_COMMAND_STATE,
    );
  });

  it("runs commands only against the active editor bridge", () => {
    const runCommand = vi.fn(() => true);

    documentEditorBridge.set(
      "doc:test",
      createMilkdownEditorBridge({
        runCommand,
      }),
    );

    expect(documentEditorBridge.runCommand("doc:test", "edit.selectAll")).toBe(true);
    expect(runCommand).toHaveBeenCalledWith("edit.selectAll");

    expect(documentEditorBridge.runCommand("doc:other", "edit.selectAll")).toBe(false);
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it("notifies a stable listener snapshot", () => {
    const secondListener = vi.fn();
    const secondListenerDisposable = documentEditorBridge.onDidChangeCommandState(secondListener);
    const firstListener = vi.fn(() => secondListenerDisposable.dispose());
    const firstListenerDisposable = documentEditorBridge.onDidChangeCommandState(firstListener);

    documentEditorBridge.fireCommandStateChanged();

    firstListenerDisposable.dispose();

    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);
  });
});
