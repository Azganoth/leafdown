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

  it("keeps each open document's editor while another document's editor arrives", () => {
    const navigateToOutlineHeading = vi.fn(() => true);
    documentEditorBridge.set("doc:first", createMilkdownEditorBridge({ navigateToOutlineHeading }));

    expect(documentEditorBridge.navigateToOutlineHeading("doc:first", 0)).toBe(true);
    expect(documentEditorBridge.navigateToOutlineHeading("doc:other", 0)).toBe(false);
    documentEditorBridge.set(
      "doc:second",
      createMilkdownEditorBridge({ getMarkdown: () => "# Second" }),
    );

    expect(documentEditorBridge.navigateToOutlineHeading("doc:first", 0)).toBe(true);
    expect(documentEditorBridge.getMarkdown("doc:second")).toBe("# Second");
    expect(navigateToOutlineHeading).toHaveBeenCalledTimes(2);

    documentEditorBridge.set("doc:first", null);

    expect(documentEditorBridge.navigateToOutlineHeading("doc:first", 0)).toBe(false);
  });

  it("navigates to a requested heading once its document is shown", () => {
    const navigateToHeading = vi.fn();
    documentEditorBridge.set("doc:first", createMilkdownEditorBridge({ navigateToHeading }));
    documentEditorBridge.show("doc:other");

    documentEditorBridge.requestHeading("doc:first", "Setup");

    expect(navigateToHeading).not.toHaveBeenCalled();

    documentEditorBridge.show("doc:first");

    expect(navigateToHeading).toHaveBeenCalledExactlyOnceWith("Setup");
  });

  it("drops a requested heading when another document is shown first", () => {
    const navigateToHeading = vi.fn();
    documentEditorBridge.set("doc:first", createMilkdownEditorBridge({ navigateToHeading }));

    documentEditorBridge.requestHeading("doc:first", "Setup");
    documentEditorBridge.show("doc:other");
    documentEditorBridge.show("doc:first");

    expect(navigateToHeading).not.toHaveBeenCalled();
  });

  it("chooses a search match once its document's editor is ready and shown", async () => {
    const chooseSearchMatch = vi.fn(async () => 2);
    const query = { caseSensitive: false, text: "leaf", wholeWord: false };
    const target = {
      ordinal: 2,
      context: { before: "", match: "leaf", after: "", clippedBefore: false, clippedAfter: false },
    };

    const choosing = documentEditorBridge.chooseSearchMatch("doc:first", query, target);

    documentEditorBridge.set("doc:first", createMilkdownEditorBridge({ chooseSearchMatch }));
    expect(chooseSearchMatch).not.toHaveBeenCalled();

    documentEditorBridge.show("doc:first");

    await expect(choosing).resolves.toBe(2);
    expect(chooseSearchMatch).toHaveBeenCalledWith(query, target);
  });

  it("resolves a pending search match to null when another document is shown", async () => {
    const query = { caseSensitive: false, text: "leaf", wholeWord: false };

    const choosing = documentEditorBridge.chooseSearchMatch("doc:first", query, {
      ordinal: 0,
      context: { before: "", match: "leaf", after: "", clippedBefore: false, clippedAfter: false },
    });
    documentEditorBridge.show("doc:other");

    await expect(choosing).resolves.toBeNull();
  });

  it("focuses an editor once its document is shown", () => {
    const focus = vi.fn();
    documentEditorBridge.set("doc:first", createMilkdownEditorBridge({ focus }));
    documentEditorBridge.show("doc:other");

    documentEditorBridge.focusWhenShown("doc:first");

    expect(focus).not.toHaveBeenCalled();

    documentEditorBridge.show("doc:first");

    expect(focus).toHaveBeenCalledOnce();
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
