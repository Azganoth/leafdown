// @vitest-environment happy-dom

import { AllSelection, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection } from "@milkdown/kit/prose/tables";
import { describe, expect, it, vi } from "vitest";

import { selectAll } from "@/features/editor/commands/editing/selection";
import { TEXT_HTML_MIME_TYPE, TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { BOLD_PLAIN_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { createClipboardData, dispatchClipboardEvent, dispatchKeyDown } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  getEditorNodePosition,
  runKeyDownHandlers,
  selectTableCellRange,
  setTextSelection,
} from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import { runEditorCommand } from "../commands";
import {
  BlockSelection,
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "./blockSelection";
import { isStructuralBlockSelection } from "./blockSelectionKeyboard";
import { hasActiveSourceProjection } from "./sourceProjection";

const mountEditor = setupMilkdownEditorMount();

const runProgressiveSelectAll = (mounted: Awaited<ReturnType<typeof mountEditor>>) =>
  runKeyDownHandlers(mounted.view, "a", { ctrl: true, keyCode: 65 });

const selectedBlockText = (mounted: Awaited<ReturnType<typeof mountEditor>>) => {
  const { selection } = mounted.view.state;

  if (!(selection instanceof BlockSelection)) {
    return null;
  }

  return selection.content().content.textBetween(0, selection.content().content.size, " ");
};

describe("block selection keyboard", () => {
  it("intercepts the editor DOM keydown before the app Select all shortcut", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "First") + 1);

    const event = dispatchKeyDown(mounted.view.dom, "a", { ctrl: true, keyCode: 65 });

    expect(event.defaultPrevented).toBe(true);
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
  });

  it("progresses from a nested item through sibling and containing scopes to the document", async () => {
    const mounted = await mountEditor(`Before

- Parent
  - First
  - Second

After
`);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "First") + 1);

    expect(runProgressiveSelectAll(mounted).handled).toBe(true);
    expect(selectedBlockText(mounted)).toBe("First");

    runProgressiveSelectAll(mounted);
    expect(selectedBlockText(mounted)).toBe("First Second");

    runProgressiveSelectAll(mounted);
    expect(selectedBlockText(mounted)).toBe("Parent First Second");

    runProgressiveSelectAll(mounted);
    expect(mounted.view.state.selection).toBeInstanceOf(AllSelection);
    expect(isStructuralBlockSelection(mounted.view.state)).toBe(true);

    const repeat = runProgressiveSelectAll(mounted);
    expect(repeat.handled).toBe(true);
    expect(mounted.view.state.selection).toBeInstanceOf(AllSelection);
  });

  it("treats blockquote children and the quote container as successive scopes", async () => {
    const mounted = await mountEditor(`> First
>
> Second
`);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "First") + 1);

    runProgressiveSelectAll(mounted);
    expect(selectedBlockText(mounted)).toBe("First");

    runProgressiveSelectAll(mounted);
    expect(selectedBlockText(mounted)).toBe("First Second");

    runProgressiveSelectAll(mounted);
    expect(selectedBlockText(mounted)).toBe("First Second");
    expect((mounted.view.state.selection as BlockSelection).$anchorBlock.nodeAfter?.type.name).toBe(
      "blockquote",
    );
  });

  it("moves, extends, and reverses the head through siblings without changing the anchor", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "First") + 1);
    runProgressiveSelectAll(mounted);

    expect(runKeyDownHandlers(mounted.view, "ArrowDown").handled).toBe(true);
    expect(selectedBlockText(mounted)).toBe("Second");

    runKeyDownHandlers(mounted.view, "ArrowUp", { shift: true });
    expect(selectedBlockText(mounted)).toBe("First Second");
    expect((mounted.view.state.selection as BlockSelection).$anchorBlock.pos).toBeGreaterThan(
      (mounted.view.state.selection as BlockSelection).$headBlock.pos,
    );

    runKeyDownHandlers(mounted.view, "ArrowDown", { shift: true });
    expect(selectedBlockText(mounted)).toBe("Second");
  });

  it("uses Escape to enter and exit while restoring the text bookmark", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    const first = getEditorTextPosition(mounted, "First");
    setTextSelection(mounted.view, first + 1, first + 4);

    expect(runKeyDownHandlers(mounted.view, "Escape").handled).toBe(true);
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);

    expect(runKeyDownHandlers(mounted.view, "Escape").handled).toBe(true);
    expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
    expect(mounted.view.state.selection.anchor).toBe(first + 1);
    expect(mounted.view.state.selection.head).toBe(first + 4);
  });

  it("lets Escape dismiss an open popup before changing the structural selection", async () => {
    let popupOpen = false;
    const onContextPopupClosed = vi.fn(() => {
      popupOpen = false;
    });
    const mounted = await mountEditor("First\n\nSecond\n", {
      getContextPopupOpen: () => popupOpen,
      onContextPopupClosed,
      onContextPopupRequested: () => {
        popupOpen = true;
      },
    });
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "First") + 1);
    runProgressiveSelectAll(mounted);
    const selection = mounted.view.state.selection;

    expect(popupOpen).toBe(true);
    runKeyDownHandlers(mounted.view, "Escape");

    expect(onContextPopupClosed).toHaveBeenCalledOnce();
    expect(mounted.view.state.selection.eq(selection)).toBe(true);
  });

  it("restores editing from the remembered caret or the head block", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Second") + 1);
    runProgressiveSelectAll(mounted);

    expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);
    expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
    expect(mounted.view.state.selection.from).toBe(getEditorTextPosition(mounted, "Second") + 1);

    const blocks = getSelectableBlockTargets(mounted.view.state.doc);
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, blocks[0].pos),
      ),
    );
    runKeyDownHandlers(mounted.view, "Enter");

    expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
    expect(mounted.view.state.selection.empty).toBe(true);
  });

  it("finalizes projected source before selecting, cutting, undoing, and replacing its block", async () => {
    const mounted = await mountEditor(`${BOLD_PLAIN_MARKDOWN}\n\nSecond\n`);
    enterProjection(mounted, "strong");

    runProgressiveSelectAll(mounted);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
    expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n\nSecond\n`);

    const clipboardData = createClipboardData();
    dispatchClipboardEvent(mounted.view.dom, "cut", clipboardData);
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toContain("**");
    expect(clipboardData.getData(TEXT_HTML_MIME_TYPE)).toContain("<strong>");
    expect(mounted.getMarkdown()).toBe("Second\n");

    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n\nSecond\n`);
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);

    dispatchClipboardEvent(mounted.view.dom, "paste", {
      [TEXT_PLAIN_MIME_TYPE]: clipboardData.getData(TEXT_PLAIN_MIME_TYPE),
      [TEXT_HTML_MIME_TYPE]: clipboardData.getData(TEXT_HTML_MIME_TYPE),
    });
    expect(mounted.getMarkdown()).toBe(`${BOLD_PLAIN_MARKDOWN}\n\nSecond\n`);
  });

  it("leaves node and native table-cell selections to their existing owners", async () => {
    const mounted = await mountEditor("| A | B |\n| - | - |\n| C | D |\n");
    const table = getEditorNodePosition(mounted, "table");

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(NodeSelection.create(mounted.view.state.doc, table)),
    );
    expect(runProgressiveSelectAll(mounted).handled).toBe(true);
    expect(isStructuralBlockSelection(mounted.view.state)).toBe(false);

    selectTableCellRange(mounted, { row: 0, col: 0 }, { row: 1, col: 1 });
    expect(mounted.view.state.selection).toBeInstanceOf(CellSelection);
    expect(runProgressiveSelectAll(mounted).handled).toBe(true);
    expect(isStructuralBlockSelection(mounted.view.state)).toBe(false);
  });

  it("keeps the app Select all command immediate rather than progressive", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "First") + 1);

    expect(selectAll(mounted.view)).toBe(true);
    expect(mounted.view.state.selection).toBeInstanceOf(AllSelection);
    expect(isStructuralBlockSelection(mounted.view.state)).toBe(false);
  });
});
