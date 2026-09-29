import { afterEach, describe, expect, it, vi } from "vitest";

import type { EditorDocumentStatus } from "@/features/editor";
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
    expect(documentEditorBridge.getCommandState("doc:test").enabledCommands["edit.selectAll"]).toBe(
      true,
    );

    listenerDisposable.dispose();
    documentEditorBridge.fireCommandStateChanged();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reads document status from the active editor bridge only", () => {
    const listener = vi.fn();
    const listenerDisposable = documentEditorBridge.onDidChangeDocumentStatus(listener);
    const status = {
      blockPath: [{ kind: "paragraph" }],
      document: { characters: 5, charactersWithoutSpaces: 5, words: 1 },
      selection: null,
    } satisfies EditorDocumentStatus;

    documentEditorBridge.set(
      "doc:test",
      createMilkdownEditorBridge({ getDocumentStatus: () => status }),
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(documentEditorBridge.getDocumentStatus("doc:test")).toBe(status);
    expect(documentEditorBridge.getDocumentStatus("doc:other")).toBeNull();

    documentEditorBridge.set("doc:test", null);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(documentEditorBridge.getDocumentStatus("doc:test")).toBeNull();

    listenerDisposable.dispose();
  });

  it("keeps outline rows and navigation scoped to the current document", () => {
    const navigateToOutlineHeading = vi.fn(() => true);
    const outline = {
      headings: [{ position: 0, level: 1, text: "First", context: [] }],
      activePosition: 0,
    };
    const listener = vi.fn();
    const subscription = documentEditorBridge.onDidChangeHeadingOutline(listener);
    documentEditorBridge.set("doc:first", createMilkdownEditorBridge({ navigateToOutlineHeading }));
    documentEditorBridge.setHeadingOutline("doc:first", outline);

    expect(documentEditorBridge.getHeadingOutline("doc:first")).toBe(outline);
    expect(documentEditorBridge.navigateToOutlineHeading("doc:first", 0)).toBe(true);
    expect(documentEditorBridge.navigateToOutlineHeading("doc:other", 0)).toBe(false);
    documentEditorBridge.set("doc:second", createMilkdownEditorBridge());
    documentEditorBridge.setHeadingOutline("doc:first", outline);

    expect(documentEditorBridge.getHeadingOutline("doc:first").headings).toHaveLength(0);
    expect(documentEditorBridge.getHeadingOutline("doc:second").headings).toHaveLength(0);
    expect(navigateToOutlineHeading).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(3);
    subscription.dispose();
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

  it("inserts links only through the active editor bridge", () => {
    const insertLink = vi.fn(() => true);

    documentEditorBridge.set("doc:test", createMilkdownEditorBridge({ insertLink }));

    expect(documentEditorBridge.insertLink("doc:test", "Guide", "docs/guide.md")).toBe(true);
    expect(insertLink).toHaveBeenCalledWith("Guide", "docs/guide.md");
    expect(documentEditorBridge.insertLink("doc:other", "Guide", "docs/guide.md")).toBe(false);
    expect(insertLink).toHaveBeenCalledTimes(1);
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
