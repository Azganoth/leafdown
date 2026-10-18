// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";

const mountEditor = setupMilkdownEditorMount();

describe("Typed list markers", () => {
  it.each([
    { marker: "-", node: "bullet_list", other: "+" },
    { marker: "+", node: "bullet_list", other: "*" },
    { marker: "*", node: "bullet_list", other: "-" },
    { marker: "1.", node: "ordered_list", other: "1)" },
    { marker: "1)", node: "ordered_list", other: "1." },
  ])("keeps a typed $marker marker", async ({ marker, node, other }) => {
    for (const prefix of ["", `${other} Existing\n\n`]) {
      const source = `${prefix}Paragraph\n`;
      const mounted = await mountEditor(source);

      setSelectionAtDocumentEnd(mounted.view);
      await runEditorCommand(mounted.editor, "insert.paragraph");
      typeText(mounted.view, `${marker} `);

      expect(mounted.view.state.selection.$from.node(1).type.name).toBe(node);
      expect(mounted.view.state.selection.$from.node(1).attrs.marker).toBe(marker.at(-1));

      typeText(mounted.view, "Item");

      const saved = `${source}\n${marker} Item\n`;
      expect(mounted.getMarkdown()).toBe(saved);

      const reopened = await mountEditor(saved);
      expect(reopened.getMarkdown()).toBe(saved);
      expect(reopened.view.state.doc.lastChild?.type.name).toBe(node);
    }
  });

  it.each([
    { command: "format.unorderedList", marker: "+" },
    { command: "format.orderedList", marker: "1)" },
  ] as const)("keeps the prevailing marker for $command", async ({ command, marker }) => {
    const mounted = await mountEditor(`${marker} Existing\n\nParagraph\n\nNew\n`);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "New"));
    await runEditorCommand(mounted.editor, command);

    expect(mounted.getMarkdown()).toBe(`${marker} Existing\n\nParagraph\n\n${marker} New\n`);
  });

  it.each([
    { previous: "+", marker: "-" },
    { previous: "-", marker: "+" },
    { previous: "-", marker: "*" },
    { previous: "1)", marker: "1." },
    { previous: "1.", marker: "1)" },
    { previous: "1)", marker: "2." },
    { previous: "1.", marker: "2)" },
  ])("keeps a typed $marker marker beside a $previous list", async ({ marker, previous }) => {
    const mounted = await mountEditor(`${previous} Existing\n\nNew\n`);

    const position = getEditorTextPosition(mounted, "New");
    setTextSelection(mounted.view, position, position + "New".length);
    typeText(mounted.view, `${marker} Item`);

    expect(mounted.getMarkdown()).toBe(`${previous} Existing\n\n${marker} Item\n`);
    expect(mounted.view.state.doc.childCount).toBe(2);
  });

  it.each(["42.", "42)"])("keeps the start number typed with %s", async (marker) => {
    const mounted = await mountEditor("");

    typeText(mounted.view, `${marker} Item`);

    expect(mounted.view.state.doc.firstChild?.attrs.order).toBe(42);
    expect(mounted.getMarkdown()).toBe(`${marker} Item\n`);
  });

  it.each(["-", "+", "*"])("keeps a typed %s marker for a task list", async (marker) => {
    const mounted = await mountEditor("");

    typeText(mounted.view, `${marker} [ ] Task`);

    expect(mounted.getMarkdown()).toBe(`${marker} [ ] Task\n`);
  });

  it.each([
    { marker: "-", next: "-" },
    { marker: "+", next: "+" },
    { marker: "*", next: "*" },
    { marker: "1.", next: "2." },
    { marker: "1)", next: "2)" },
  ])("joins a continued list with the same $marker marker", async ({ marker, next }) => {
    const mounted = await mountEditor(`${marker} Existing\n\nNew\n`);

    const position = getEditorTextPosition(mounted, "New");
    setTextSelection(mounted.view, position, position + "New".length);
    typeText(mounted.view, `${next} Item`);

    expect(mounted.view.state.doc.firstChild?.childCount).toBe(2);
    expect(mounted.getMarkdown()).toBe(`${marker} Existing\n${next} Item\n`);
  });

  it.each([
    { previous: "1.", marker: "1.", saved: "1)" },
    { previous: "1)", marker: "1)", saved: "1." },
  ])("separates a new $marker list from an adjacent list", async ({ previous, marker, saved }) => {
    const mounted = await mountEditor(`${previous} Existing\n\nNew\n`);

    const position = getEditorTextPosition(mounted, "New");
    setTextSelection(mounted.view, position, position + "New".length);
    typeText(mounted.view, `${marker} Item`);

    const markdown = `${previous} Existing\n\n${saved} Item\n`;
    expect(mounted.getMarkdown()).toBe(markdown);

    const reopened = await mountEditor(markdown);
    expect(reopened.view.state.doc.childCount).toBe(2);
  });

  it.each(["-", "+", "*", "1.", "1)"])(
    "keeps the %s marker through Undo and Redo",
    async (marker) => {
      const mounted = await mountEditor("");

      typeText(mounted.view, `${marker} Item`);

      await runEditorCommand(mounted.editor, "edit.undo");
      await runEditorCommand(mounted.editor, "edit.redo");

      expect(mounted.getMarkdown()).toBe(`${marker} Item\n`);
    },
  );
});
