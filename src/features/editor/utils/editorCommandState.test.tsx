import { afterEach, describe, expect, it, vi } from "vitest";

import {
  pressKey,
  setSelectionAtDocumentEnd,
  setSelectionAtTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";

import { getEditorCommandState } from "./editorCommandState";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (
  initialMarkdown: string,
  options: Parameters<typeof mountMilkdownEditor>[1] = {},
): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, options);
  mountedEditors.push(mounted);
  return mounted;
};

describe("editor command state", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("enables active-editor commands and disables empty history commands", async () => {
    const mounted = await mountEditor("Hello");

    setSelectionAtDocumentEnd(mounted.view);

    const state = getEditorCommandState(mounted.view);

    expect(state).toMatchObject({
      hasActiveEditor: true,
      hasSelection: false,
      hasTableSelection: false,
    });
    expect(state.enabledCommands["edit.selectAll"]).toBe(true);
    expect(state.enabledCommands["edit.paste"]).toBe(true);
    expect(state.enabledCommands["edit.jumpToLineEnd"]).toBe(true);
    expect(state.enabledCommands["edit.undo"]).toBe(false);
    expect(state.enabledCommands["edit.redo"]).toBe(false);
    expect(state.enabledCommands["edit.copy"]).toBe(false);
    expect(state.enabledCommands["edit.deleteWordBackward"]).toBe(true);
    expect(state.enabledCommands["edit.deleteWordForward"]).toBe(false);
  });

  it("tracks editor history availability", async () => {
    const mounted = await mountEditor("Hello");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");

    expect(getEditorCommandState(mounted.view).enabledCommands["edit.undo"]).toBe(true);
    expect(getEditorCommandState(mounted.view).enabledCommands["edit.redo"]).toBe(false);

    expect(pressKey(mounted.view, "z", { ctrlKey: true }).handled).toBe(true);
    expect(getEditorCommandState(mounted.view).enabledCommands["edit.undo"]).toBe(false);
    expect(getEditorCommandState(mounted.view).enabledCommands["edit.redo"]).toBe(true);
  });

  it("tracks selection-dependent commands", async () => {
    const mounted = await mountEditor("Hello world");

    setTextSelection(mounted.view, 1, 6);

    const selectedState = getEditorCommandState(mounted.view);

    expect(selectedState.hasSelection).toBe(true);
    expect(selectedState.enabledCommands["edit.copy"]).toBe(true);
    expect(selectedState.enabledCommands["edit.copyAsMarkdown"]).toBe(true);
    expect(selectedState.enabledCommands["edit.jumpToSelection"]).toBe(true);

    setSelectionAtDocumentEnd(mounted.view);

    const caretState = getEditorCommandState(mounted.view);

    expect(caretState.hasSelection).toBe(false);
    expect(caretState.enabledCommands["edit.copy"]).toBe(false);
    expect(caretState.enabledCommands["edit.jumpToSelection"]).toBe(false);
  });

  it("tracks active word and table context availability", async () => {
    const mounted = await mountEditor("| A | B |\n| - | - |\n| C | D |");
    const firstCell = mounted.view.dom.querySelector("td");

    expect(firstCell).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, firstCell as HTMLTableCellElement);

    const state = getEditorCommandState(mounted.view);

    expect(state.hasTableSelection).toBe(true);
    expect(state.enabledCommands["edit.selectWord"]).toBe(true);
    expect(state.enabledCommands["edit.deleteWordBackward"]).toBe(true);
  });

  it("notifies when command availability changes", async () => {
    const onCommandStateChanged = vi.fn();
    const mounted = await mountEditor("Hello", { onCommandStateChanged });

    setSelectionAtDocumentEnd(mounted.view);
    expect(onCommandStateChanged).toHaveBeenCalledTimes(1);

    typeText(mounted.view, "!");
    expect(onCommandStateChanged).toHaveBeenCalledTimes(2);

    setTextSelection(mounted.view, 1, 6);
    expect(onCommandStateChanged).toHaveBeenCalledTimes(3);
  });
});
