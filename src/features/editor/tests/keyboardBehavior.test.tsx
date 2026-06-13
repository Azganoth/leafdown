import { afterEach, describe, expect, it } from "vitest";

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { Selection } from "@milkdown/kit/prose/state";
import { isInTable, selectedRect, TableMap } from "@milkdown/kit/prose/tables";

import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { pressKey, setSelectionAtTextEnd } from "@/test/utils/prosemirror";

const mountedEditors: MountedMilkdownEditor[] = [];
const tableMarkdown = "| A | B |\n| - | - |\n| C | D |\n| E | F |";

const mountEditor = async (initialMarkdown: string): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown);
  mountedEditors.push(mounted);
  return mounted;
};

const getFirstTable = (mounted: MountedMilkdownEditor) => {
  const tables: { node: ProseMirrorNode; start: number }[] = [];

  mounted.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") {
      return true;
    }

    tables.push({ node, start: pos + 1 });

    return false;
  });

  const table = tables[0];

  if (!table) {
    throw new Error("Expected a table in the mounted editor.");
  }

  return table;
};

const getTableCellPos = (mounted: MountedMilkdownEditor, row: number, col: number) => {
  const table = getFirstTable(mounted);

  return table.start + TableMap.get(table.node).positionAt(row, col, table.node);
};

const setSelectionInTableCell = (mounted: MountedMilkdownEditor, row: number, col: number) => {
  const cellPos = getTableCellPos(mounted, row, col);
  const selection = Selection.findFrom(mounted.view.state.doc.resolve(cellPos + 1), 1, true);

  if (!selection) {
    throw new Error("Could not place selection inside table cell.");
  }

  mounted.view.dispatch(mounted.view.state.tr.setSelection(selection));
};

const selectedTableCellRect = (mounted: MountedMilkdownEditor) => selectedRect(mounted.view.state);

describe("Milkdown keyboard behavior", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("uses Milkdown defaults to continue list items with Enter", async () => {
    const mounted = await mountEditor("- one");
    const listItem = mounted.view.dom.querySelector("li");

    expect(listItem).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, listItem as HTMLLIElement);
    const { handled } = pressKey(mounted.view, "Enter");

    expect(handled).toBe(true);
    expect(mounted.view.dom.querySelectorAll("li")).toHaveLength(2);
  });

  it("uses Milkdown defaults to indent and outdent list items", async () => {
    const mounted = await mountEditor("- one\n- two");
    const listItems = mounted.view.dom.querySelectorAll("li");

    expect(listItems).toHaveLength(2);

    setSelectionAtTextEnd(mounted.view, listItems[1]);

    expect(pressKey(mounted.view, "Tab").handled).toBe(true);
    expect(mounted.getMarkdown()).toContain("  * two");

    expect(pressKey(mounted.view, "Tab", { shiftKey: true }).handled).toBe(true);
    expect(mounted.getMarkdown()).toBe("* one\n\n* two\n");
  });

  it("uses Milkdown defaults to insert hard breaks with Shift+Enter", async () => {
    const mounted = await mountEditor("one");
    const paragraph = mounted.view.dom.querySelector("p");

    expect(paragraph).toBeInTheDocument();

    setSelectionAtTextEnd(mounted.view, paragraph as HTMLParagraphElement);
    const { handled } = pressKey(mounted.view, "Enter", { shiftKey: true });

    expect(handled).toBe(true);
    expect(paragraph?.querySelector("br")).toBeInTheDocument();
  });

  it("moves between table cells with Tab and Shift+Tab", async () => {
    const mounted = await mountEditor(tableMarkdown);

    setSelectionInTableCell(mounted, 1, 0);

    expect(pressKey(mounted.view, "Tab").handled).toBe(true);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 1, top: 1 });

    expect(pressKey(mounted.view, "Tab", { shiftKey: true }).handled).toBe(true);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 0, top: 1 });
  });

  it("adds a row from the final table cell when Tab is pressed", async () => {
    const mounted = await mountEditor(tableMarkdown);

    setSelectionInTableCell(mounted, 2, 1);

    expect(pressKey(mounted.view, "Tab").handled).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(4);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 0, top: 3 });
  });

  it("moves down table cells with Enter and creates a bottom row when needed", async () => {
    const mounted = await mountEditor(tableMarkdown);

    setSelectionInTableCell(mounted, 1, 1);

    expect(pressKey(mounted.view, "Enter").handled).toBe(true);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 1, top: 2 });

    expect(pressKey(mounted.view, "Enter").handled).toBe(true);
    expect(mounted.view.dom.querySelectorAll("tr")).toHaveLength(4);
    expect(selectedTableCellRect(mounted)).toMatchObject({ left: 1, top: 3 });
  });

  it("exits a table downward with ArrowDown from the bottom row", async () => {
    const mounted = await mountEditor("| A | B |\n| - | - |\n| C | D |");

    setSelectionInTableCell(mounted, 1, 1);

    expect(pressKey(mounted.view, "ArrowDown").handled).toBe(true);
    expect(isInTable(mounted.view.state)).toBe(false);
    expect(mounted.view.dom.lastElementChild?.tagName.toLowerCase()).toBe("p");
  });
});
