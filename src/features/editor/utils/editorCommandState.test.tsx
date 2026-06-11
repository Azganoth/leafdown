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
    expect(state.enabledCommands["insert.image"]).toBe(true);
    expect(state.enabledCommands["insert.table"]).toBe(true);
    expect(state.enabledCommands["format.strong"]).toBe(true);
    expect(state.enabledCommands["format.paragraph"]).toBe(true);
    expect(state.enabledCommands["format.clearInline"]).toBe(false);
    expect(state.enabledCommands["format.clearBlock"]).toBe(false);
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

  it("uses projection-local history availability while projection is active", async () => {
    const mounted = await mountEditor("**Bold** plain");
    const strong = mounted.view.dom.querySelector("strong");

    expect(strong).toBeInTheDocument();

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "!");
    setSelectionAtTextEnd(mounted.view, strong as HTMLElement);

    expect(getEditorCommandState(mounted.view).enabledCommands["edit.undo"]).toBe(false);
    expect(getEditorCommandState(mounted.view).enabledCommands["edit.redo"]).toBe(false);

    typeText(mounted.view, "er");

    expect(getEditorCommandState(mounted.view).enabledCommands["edit.undo"]).toBe(true);
    expect(getEditorCommandState(mounted.view).enabledCommands["edit.redo"]).toBe(false);
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
    expect(state.enabledCommands["format.table.delete"]).toBe(true);
    expect(state.enabledCommands["format.table.addRowAbove"]).toBe(true);
    expect(state.enabledCommands["format.table.addColumnAfter"]).toBe(true);
    expect(state.enabledCommands["format.table.deleteRow"]).toBe(true);
    expect(state.enabledCommands["format.table.deleteColumn"]).toBe(true);
    expect(state.enabledCommands["format.table.moveRowUp"]).toBe(false);
    expect(state.enabledCommands["format.table.moveRowDown"]).toBe(false);
    expect(state.enabledCommands["format.table.moveColumnLeft"]).toBe(false);
    expect(state.enabledCommands["format.table.moveColumnRight"]).toBe(true);
  });

  it("disables row commands that would change the table header row", async () => {
    const mounted = await mountEditor("| A | B |\n| - | - |\n| C | D |");
    const firstHeaderCell = mounted.view.dom.querySelector("th");

    expect(firstHeaderCell).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, firstHeaderCell as HTMLTableCellElement);

    const state = getEditorCommandState(mounted.view);

    expect(state.hasTableSelection).toBe(true);
    expect(state.enabledCommands["format.table.addRowAbove"]).toBe(false);
    expect(state.enabledCommands["format.table.addRowBelow"]).toBe(true);
    expect(state.enabledCommands["format.table.addColumnAfter"]).toBe(true);
    expect(state.enabledCommands["format.table.deleteRow"]).toBe(false);
    expect(state.enabledCommands["format.table.deleteColumn"]).toBe(true);
    expect(state.enabledCommands["format.table.moveRowUp"]).toBe(false);
    expect(state.enabledCommands["format.table.moveRowDown"]).toBe(false);
    expect(state.enabledCommands["format.table.moveColumnLeft"]).toBe(false);
    expect(state.enabledCommands["format.table.moveColumnRight"]).toBe(true);
  });

  it("tracks formatting-specific command availability", async () => {
    const inlineMounted = await mountEditor("**Hello**");

    setTextSelection(inlineMounted.view, 3);

    expect(getEditorCommandState(inlineMounted.view).enabledCommands["format.clearInline"]).toBe(
      true,
    );

    const headingMounted = await mountEditor("# Heading");

    setSelectionAtDocumentEnd(headingMounted.view);

    const headingState = getEditorCommandState(headingMounted.view);

    expect(headingState.enabledCommands["format.increaseHeading"]).toBe(true);
    expect(headingState.enabledCommands["format.decreaseHeading"]).toBe(false);
    expect(headingState.enabledCommands["format.clearBlock"]).toBe(true);

    const taskMounted = await mountEditor("- [ ] Todo");

    setSelectionAtDocumentEnd(taskMounted.view);

    const taskState = getEditorCommandState(taskMounted.view);

    expect(taskState.enabledCommands["format.toggleTaskChecked"]).toBe(true);
    expect(taskState.enabledCommands["format.clearBlock"]).toBe(true);

    const listMounted = await mountEditor("- First\n- Second");
    const listItems = listMounted.view.dom.querySelectorAll("li");

    setTextSelection(listMounted.view, listMounted.view.posAtDOM(listItems[1], 0));

    const listState = getEditorCommandState(listMounted.view);

    expect(listState.enabledCommands["format.increaseListIndent"]).toBe(true);
    expect(listState.enabledCommands["format.decreaseListIndent"]).toBe(true);
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
