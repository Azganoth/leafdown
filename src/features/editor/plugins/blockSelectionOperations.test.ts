// @vitest-environment happy-dom

import { TextSelection } from "@milkdown/kit/prose/state";
import { markdownToSlice } from "@milkdown/kit/utils";
import { describe, expect, it } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { createClipboardData, dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  runKeyDownHandlers,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import {
  BlockSelection,
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
} from "./blockSelection";
import {
  canMoveSelectedBlocks,
  deleteSelectedBlocks,
  moveSelectedBlocks,
  moveSelectedBlocksToBoundary,
} from "./blockSelectionOperations";

const mountEditor = setupMilkdownEditorMount();

const select = (
  view: Awaited<ReturnType<typeof mountEditor>>["view"],
  type: string,
  anchorIndex: number,
  headIndex = anchorIndex,
) => {
  const targets = getSelectableBlockTargets(view.state.doc).filter(
    ({ node }) => node.type.name === type,
  );
  view.dispatch(
    view.state.tr.setSelection(
      createHierarchicalBlockSelection(
        view.state.doc,
        targets[anchorIndex].pos,
        targets[headIndex].pos,
      ),
    ),
  );
};

describe("block selection operations", () => {
  it("copies nested sibling subtrees and cuts them in one undoable action", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n    - Child\n  - Second\n  - Third\n");
    select(mounted.view, "list_item", 1, 3);
    const clipboardData = createClipboardData();

    dispatchClipboardEvent(mounted.view.dom, "cut", clipboardData);

    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toContain("Child");
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).not.toContain("Parent");
    expect(mounted.getMarkdown()).not.toContain("First");
    expect(mounted.getMarkdown()).toContain("Third");
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toContain("First");
    expect(mounted.view.state.selection).toBeInstanceOf(BlockSelection);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).not.toContain("First");
  });

  it("deletes a nested range on Backspace without detaching neighboring children", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n  - Third\n");
    select(mounted.view, "list_item", 1, 2);

    expect(runKeyDownHandlers(mounted.view, "Backspace").handled).toBe(true);
    expect(mounted.getMarkdown()).toContain("Parent");
    expect(mounted.getMarkdown()).toContain("Third");
    expect(mounted.getMarkdown()).not.toContain("First");
    expect(mounted.getMarkdown()).not.toContain("Second");
  });

  it("restores a remembered caret outside the deleted range", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Third") + 2);
    expect(runKeyDownHandlers(mounted.view, "Escape").handled).toBe(true);
    expect(runKeyDownHandlers(mounted.view, "ArrowUp").handled).toBe(true);

    expect(deleteSelectedBlocks(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).not.toContain("Second");
    expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
    expect(
      mounted.view.state.doc.textBetween(
        mounted.view.state.selection.from - 2,
        mounted.view.state.selection.from + 3,
      ),
    ).toBe("Third");
  });

  it("uses the surviving boundary when a remembered text range overlaps deleted blocks", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "First") + 2,
      getEditorTextPosition(mounted, "Second") + 2,
    );
    expect(runKeyDownHandlers(mounted.view, "Escape").handled).toBe(true);

    expect(deleteSelectedBlocks(mounted.view)).toBe(true);
    expect(mounted.view.state.selection).toBeInstanceOf(TextSelection);
    expect(mounted.view.state.selection.empty).toBe(true);
  });

  it("moves a reversed nested sibling range while preserving order and selection direction", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n  - Third\n");
    select(mounted.view, "list_item", 2, 1);

    expect(canMoveSelectedBlocks(mounted.view.state, -1)).toBe(false);
    expect(canMoveSelectedBlocks(mounted.view.state, 1)).toBe(true);
    expect(moveSelectedBlocks(mounted.view, 1)).toBe(true);
    expect(mounted.getMarkdown().indexOf("Third")).toBeLessThan(
      mounted.getMarkdown().indexOf("First"),
    );
    const selection = mounted.view.state.selection;
    expect(selection).toBeInstanceOf(BlockSelection);
    expect((selection as BlockSelection).$anchorBlock.pos).toBeGreaterThan(
      (selection as BlockSelection).$headBlock.pos,
    );
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown().indexOf("First")).toBeLessThan(
      mounted.getMarkdown().indexOf("Third"),
    );
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown().indexOf("Third")).toBeLessThan(
      mounted.getMarkdown().indexOf("First"),
    );
  });

  it("runs Alt+Up through the editor keymap and disables movement at a boundary", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    select(mounted.view, "paragraph", 1);

    expect(runKeyDownHandlers(mounted.view, "ArrowUp", { alt: true, keyCode: 38 }).handled).toBe(
      true,
    );
    expect(mounted.getMarkdown().indexOf("Second")).toBeLessThan(
      mounted.getMarkdown().indexOf("First"),
    );
    expect(canMoveSelectedBlocks(mounted.view.state, -1)).toBe(false);
  });

  it("leaves Alt+Up to other editor behavior outside block selection", async () => {
    const mounted = await mountEditor("First\n\nSecond\n");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Second") + 1);

    expect(runKeyDownHandlers(mounted.view, "ArrowUp", { alt: true, keyCode: 38 }).handled).toBe(
      false,
    );
  });

  it("moves a root range to a nonadjacent boundary and rejects cross-parent targets", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n\nFourth\n");
    select(mounted.view, "paragraph", 0, 1);
    const paragraphs = getSelectableBlockTargets(mounted.view.state.doc).filter(
      ({ node }) => node.type.name === "paragraph",
    );

    expect(
      moveSelectedBlocksToBoundary(mounted.view, paragraphs[3].pos + paragraphs[3].node.nodeSize),
    ).toBe(true);
    expect(mounted.getMarkdown().indexOf("Third")).toBeLessThan(
      mounted.getMarkdown().indexOf("First"),
    );
    expect(mounted.getMarkdown().indexOf("First")).toBeLessThan(
      mounted.getMarkdown().indexOf("Second"),
    );

    const nested = await mountEditor("- Parent\n  - Child\n\nAfter\n");
    select(nested.view, "list_item", 1);
    const after = getSelectableBlockTargets(nested.view.state.doc).find(
      ({ node }) => node.type.name === "paragraph" && node.textContent === "After",
    );
    expect(moveSelectedBlocksToBoundary(nested.view, after!.pos)).toBe(false);
  });

  it("deletes a selected atomic block through the command", async () => {
    const mounted = await mountEditor("Before\n\n```ts\nconst value = 1;\n```\n\nAfter\n");
    select(mounted.view, "code_block", 0);

    expect(deleteSelectedBlocks(mounted.view)).toBe(true);
    expect(mounted.getMarkdown()).not.toContain("const value");
    expect(mounted.getMarkdown()).toContain("Before");
    expect(mounted.getMarkdown()).toContain("After");
  });

  it("replaces a selected nested list item with pasted Markdown as a structural slice", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n");
    select(mounted.view, "list_item", 1);

    const replacement = mounted.editor.action(markdownToSlice("- Replacement\n"));
    mounted.view.dispatch(mounted.view.state.tr.replaceSelection(replacement));

    expect(mounted.getMarkdown()).toContain("Parent");
    expect(mounted.getMarkdown()).toContain("Replacement");
    expect(mounted.getMarkdown()).toContain("Second");
    expect(mounted.getMarkdown()).not.toContain("First");
  });

  it("replaces a selected paragraph with typed text", async () => {
    const mounted = await mountEditor("Before\n\nOld\n\nAfter\n");
    select(mounted.view, "paragraph", 1);

    mounted.view.dispatch(mounted.view.state.tr.insertText("New"));

    expect(mounted.getMarkdown()).toBe("Before\n\nNew\n\nAfter\n");
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("Before\n\nOld\n\nAfter\n");
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("Before\n\nNew\n\nAfter\n");
  });

  it("keeps adjacent authored list groups outside a cross-parent cut", async () => {
    const mounted = await mountEditor("- First\n- Second\n\n+ Third\n\n* Fourth\n");
    const items = getSelectableBlockTargets(mounted.view.state.doc).filter(
      ({ node }) => node.type.name === "list_item",
    );
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        createHierarchicalBlockSelection(mounted.view.state.doc, items[1].pos, items[2].pos),
      ),
    );
    const clipboardData = createClipboardData();

    dispatchClipboardEvent(mounted.view.dom, "cut", clipboardData);

    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toContain("Second");
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toContain("Third");
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).not.toContain("First");
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).not.toContain("Fourth");
    expect(mounted.getMarkdown()).toContain("First");
    expect(mounted.getMarkdown()).toContain("Fourth");
  });
});
