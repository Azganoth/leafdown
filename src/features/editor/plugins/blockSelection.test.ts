// @vitest-environment happy-dom

import { Selection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";

import {
  BlockSelection,
  createHierarchicalBlockSelection,
  getSelectableBlockTargets,
  getSelectedBlockTargets,
} from "./blockSelection";

const mountEditor = setupMilkdownEditorMount();

const findTargets = (doc: Parameters<typeof getSelectableBlockTargets>[0], type: string) =>
  getSelectableBlockTargets(doc).filter(({ node }) => node.type.name === type);

describe("BlockSelection", () => {
  it("represents nested sibling list items as exact selectable targets", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n");
    const listItems = findTargets(mounted.view.state.doc, "list_item");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      listItems[1].pos,
      listItems[2].pos,
    );

    expect(selection).toBeInstanceOf(BlockSelection);
    expect(selection.$from.parent.type.name).toBe("bullet_list");
    expect(getSelectedBlockTargets(selection).map(({ node }) => node.textContent)).toEqual([
      "First",
      "Second",
    ]);
    expect(selection.content().content.textBetween(0, selection.content().content.size, " ")).toBe(
      "First Second",
    );
  });

  it("preserves direction through JSON and bookmarks", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    const paragraphs = findTargets(mounted.view.state.doc, "paragraph");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      paragraphs[2].pos,
      paragraphs[0].pos,
    );
    const restored = Selection.fromJSON(mounted.view.state.doc, selection.toJSON());
    const bookmarked = selection.getBookmark().resolve(mounted.view.state.doc);

    expect(restored.eq(selection)).toBe(true);
    expect(bookmarked.eq(selection)).toBe(true);
    expect((restored as BlockSelection).$anchorBlock.pos).toBe(paragraphs[2].pos);
    expect((restored as BlockSelection).$headBlock.pos).toBe(paragraphs[0].pos);
  });

  it("preserves exact cross-parent endpoints", async () => {
    const mounted = await mountEditor("- Parent\n  - Nested\n\nAfter\n");
    const doc = mounted.view.state.doc;
    const listItems = findTargets(doc, "list_item");
    const paragraph = findTargets(doc, "paragraph").at(-1);

    if (!paragraph) throw new Error("Expected a root paragraph.");

    const selection = createHierarchicalBlockSelection(doc, listItems[1].pos, paragraph.pos);

    expect(selection.$anchorBlock.pos).toBe(listItems[1].pos);
    expect(selection.$headBlock.pos).toBe(paragraph.pos);
    expect(getSelectedBlockTargets(selection).map(({ node }) => node.textContent)).toEqual([
      "Nested",
      "After",
    ]);
  });

  it("keeps exact unordered-list item endpoints across separately authored lists", async () => {
    const mounted = await mountEditor(`- Hyphen item
- Second hyphen item

+ Plus item starts another list

* Asterisk item starts another list
`);
    const listItems = findTargets(mounted.view.state.doc, "list_item");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      listItems[1].pos,
      listItems[2].pos,
    );

    expect(getSelectedBlockTargets(selection).map(({ node }) => node.textContent)).toEqual([
      "Second hyphen item",
      "Plus item starts another list",
    ]);
    expect(selection.content().content.textBetween(0, selection.content().content.size, " ")).toBe(
      "Second hyphen item Plus item starts another list",
    );

    const serialized = mounted.view.serializeForClipboard(selection.content());
    expect(serialized.text).toContain("Second hyphen item");
    expect(serialized.text).toContain("Plus item starts another list");
    expect(serialized.text).not.toContain("Hyphen item\n");
    expect(serialized.text).not.toContain("Asterisk item starts another list");
  });

  it("preserves reverse cross-list endpoints through JSON and bookmarks", async () => {
    const mounted = await mountEditor(`- Hyphen item
- Second hyphen item

+ Plus item starts another list
`);
    const listItems = findTargets(mounted.view.state.doc, "list_item");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      listItems[2].pos,
      listItems[1].pos,
    );
    const restored = Selection.fromJSON(mounted.view.state.doc, selection.toJSON());
    const bookmarked = selection.getBookmark().resolve(mounted.view.state.doc);

    expect(restored.eq(selection)).toBe(true);
    expect(bookmarked.eq(selection)).toBe(true);
    expect((restored as BlockSelection).$anchorBlock.pos).toBe(listItems[2].pos);
    expect((restored as BlockSelection).$headBlock.pos).toBe(listItems[1].pos);
  });

  it("keeps exact ordered-list item endpoints across delimiter groups", async () => {
    const mounted = await mountEditor(`3. Starts at three
8. Subsequent source numbers do not set new starts

4) Parenthesis delimiter starts another list
5) Another item

## List interruption of paragraphs
`);
    const listItems = findTargets(mounted.view.state.doc, "list_item");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      listItems[1].pos,
      listItems[2].pos,
    );

    expect(getSelectedBlockTargets(selection).map(({ node }) => node.textContent)).toEqual([
      "Subsequent source numbers do not set new starts",
      "Parenthesis delimiter starts another list",
    ]);
  });

  it("deletes only exact cross-list item endpoints", async () => {
    const mounted = await mountEditor(`- Hyphen item
- Second hyphen item

+ Plus item starts another list

* Asterisk item starts another list
`);
    const listItems = findTargets(mounted.view.state.doc, "list_item");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      listItems[1].pos,
      listItems[2].pos,
    );
    const transaction = mounted.view.state.tr.setSelection(selection).deleteSelection();

    expect(findTargets(transaction.doc, "list_item").map(({ node }) => node.textContent)).toEqual([
      "Hyphen item",
      "Asterisk item starts another list",
    ]);
  });

  it("maps through edits inside and before its selected siblings", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    const paragraphs = findTargets(mounted.view.state.doc, "paragraph");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      paragraphs[1].pos,
      paragraphs[2].pos,
    );
    const transaction = mounted.view.state.tr.insertText("Earlier ", 1);
    transaction.insertText("Edited ", transaction.mapping.map(paragraphs[1].pos + 1));
    const mapped = selection.map(transaction.doc, transaction.mapping);

    expect(mapped).toBeInstanceOf(BlockSelection);
    expect(mapped.content().content.childCount).toBe(2);
    expect(mapped.content().content.textBetween(0, mapped.content().content.size, " ")).toContain(
      "Edited",
    );
  });

  it("maps exact cross-list endpoints through edits before and inside the range", async () => {
    const mounted = await mountEditor(`Before

- Hyphen item
- Second hyphen item

+ Plus item starts another list
`);
    const doc = mounted.view.state.doc;
    const paragraphs = findTargets(doc, "paragraph");
    const listItems = findTargets(doc, "list_item");
    const selection = createHierarchicalBlockSelection(doc, listItems[1].pos, listItems[2].pos);
    const transaction = mounted.view.state.tr.insertText("Earlier ", paragraphs[0].pos + 1);
    transaction.insertText("Edited ", transaction.mapping.map(listItems[1].pos + 2));
    const mapped = selection.map(transaction.doc, transaction.mapping);

    expect(mapped).toBeInstanceOf(BlockSelection);
    expect(
      getSelectedBlockTargets(mapped as BlockSelection).map(({ node }) => node.textContent),
    ).toEqual(["Edited Second hyphen item", "Plus item starts another list"]);
  });

  it("replaces only the selected block range", async () => {
    const mounted = await mountEditor("First\n\nSecond\n\nThird\n");
    const paragraphs = findTargets(mounted.view.state.doc, "paragraph");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      paragraphs[0].pos,
      paragraphs[1].pos,
    );
    const transaction = mounted.view.state.tr.setSelection(selection).deleteSelection();

    expect(transaction.doc.textContent).toBe("Third");
    expect(transaction.selection).not.toBeInstanceOf(BlockSelection);
  });

  it("normalizes an emptied nested sibling container", async () => {
    const mounted = await mountEditor("- Parent\n  - First\n  - Second\n\nAfter\n");
    const listItems = findTargets(mounted.view.state.doc, "list_item");
    const selection = createHierarchicalBlockSelection(
      mounted.view.state.doc,
      listItems[1].pos,
      listItems[2].pos,
    );
    const transaction = mounted.view.state.tr.setSelection(selection).deleteSelection();

    expect(() => transaction.doc.check()).not.toThrow();
    expect(transaction.doc.textContent).toBe("ParentAfter");
    expect(transaction.selection).not.toBeInstanceOf(BlockSelection);
  });

  it("keeps tables atomic and does not expose their rows or cells as gutter targets", async () => {
    const mounted = await mountEditor("| A | B |\n| - | - |\n| C | D |\n");
    const targets = getSelectableBlockTargets(mounted.view.state.doc);

    expect(targets.map(({ node }) => node.type.name)).toEqual(["table"]);
  });
});
