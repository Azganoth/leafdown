// @vitest-environment happy-dom

import { isInTable, selectedRect } from "@milkdown/kit/prose/tables";
import { describe, expect, it } from "vitest";

import { BASIC_TABLE_MARKDOWN, EXTENDED_TABLE_MARKDOWN } from "@/test/fixtures/editorMarkdown";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionInTableCell,
  setTextSelection,
} from "@/test/utils/prosemirror";

const mountEditor = setupMilkdownEditorMount();

const selectedTableCellRect = (mounted: MountedMilkdownEditor) => selectedRect(mounted.view.state);

describe("table keyboard plugin", () => {
  it("moves between table cells with Tab and Shift+Tab", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 0);

    expect(runKeyDownHandlers(mounted.view, "Tab").handled).toBe(true);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 1, top: 1 });

    expect(runKeyDownHandlers(mounted.view, "Tab", { shift: true }).handled).toBe(true);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 0, top: 1 });
  });

  it("adds a row from the final table cell when Tab is pressed", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 2, 1);

    expect(runKeyDownHandlers(mounted.view, "Tab").handled).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(4);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 0, top: 3 });
  });

  it("moves down table cells with Enter and creates a bottom row when needed", async () => {
    const mounted = await mountEditor(EXTENDED_TABLE_MARKDOWN);

    setSelectionInTableCell(mounted, 1, 1);

    expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 1, top: 2 });

    expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(4);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 1, top: 3 });
  });

  it("keeps ArrowDown inside the bottom row before the cell end", async () => {
    const mounted = await mountEditor(BASIC_TABLE_MARKDOWN);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "D"));

    const result = runKeyDownHandlers(mounted.view, "ArrowDown");

    expect(result.handled).toBe(true);
    expect(result.event.defaultPrevented).toBe(true);
    expect(isInTable(mounted.view.state)).toBe(true);
  });

  it("exits a table downward with ArrowDown from the end of the bottom row", async () => {
    const mounted = await mountEditor(BASIC_TABLE_MARKDOWN);
    const finalCellTextPosition = getEditorTextPosition(mounted, "D");

    setTextSelection(mounted.view, finalCellTextPosition + "D".length);

    expect(runKeyDownHandlers(mounted.view, "ArrowDown").handled).toBe(true);
    expect(isInTable(mounted.view.state)).toBe(false);
    expect(mounted.view.dom.lastElementChild?.tagName.toLowerCase()).toBe("p");
  });
});
