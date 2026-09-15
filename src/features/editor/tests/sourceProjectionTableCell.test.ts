// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  getTableCellTexts,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const CODE = "`";

// Every object holds one escaped pipe followed by ` sea`, which is where an edit is typed.
const cellObjects = [
  { anchor: "bee", name: "a link", source: String.raw`[bee \| sea](./doc.md)` },
  { anchor: "bee", name: "a strong fragment", source: String.raw`**bee \| sea**` },
  { anchor: "bee", name: "an emphasis fragment", source: String.raw`*bee \| sea*` },
  { anchor: "bee", name: "a strikethrough fragment", source: String.raw`~~bee \| sea~~` },
  { anchor: "bee", name: "a code span", source: String.raw`${CODE}bee \| sea${CODE}` },
  {
    anchor: "bee",
    name: "a code span holding a backslash pair",
    source: String.raw`${CODE}bee \\ \| sea${CODE}`,
  },
  { anchor: "sea", name: "a mixed-format link", source: String.raw`[**bee** \| sea](./doc.md)` },
  {
    anchor: "bee",
    name: "a link holding a code span",
    source: String.raw`[bee ${CODE}x \| sea${CODE}](./doc.md)`,
  },
  { anchor: "bee", name: "an escaped literal link", source: String.raw`\[bee \| sea](./doc.md)` },
];

// A table written with the padding the serializer gives it, so a save that changes nothing
// writes it back byte for byte.
const createTableMarkdown = (cell: string) =>
  `| ${"h".padEnd(cell.length)} | i |\n| ${"-".repeat(cell.length)} | - |\n| ${cell} | x |\n\nend\n`;

const enterProjection = (mounted: MountedMilkdownEditor, anchor: string, caretOffset = 1) => {
  setTextSelection(mounted.view, getEditorTextPosition(mounted, anchor) + caretOffset);

  expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
};

describe("source projection in a table cell", () => {
  it.each(cellObjects)(
    "shows the escaped pipe $name holds and saves it unchanged",
    async ({ anchor, source }) => {
      const cell = `a ${source} d`;
      const markdown = createTableMarkdown(cell);
      const mounted = await mountProjectionEditor(markdown);

      enterProjection(mounted, anchor);

      expect(getTableCellTexts(mounted)[1][0]).toBe(cell);
      expect(mounted.getMarkdown()).toBe(markdown);
    },
  );

  it.each(cellObjects)(
    "commits an edit next to the escaped pipe $name holds",
    async ({ anchor, source }) => {
      const editedCell = `a ${source.replace(String.raw`\| sea`, String.raw`\|Z sea`)} d`;
      const mounted = await mountProjectionEditor(createTableMarkdown(`a ${source} d`));

      enterProjection(mounted, anchor);
      setTextSelection(mounted.view, getEditorTextPosition(mounted, "| sea") + 1);
      typeText(mounted.view, "Z");

      expect(getTableCellTexts(mounted)[1][0]).toBe(editedCell);

      setSelectionAtDocumentEnd(mounted.view);

      const saved = mounted.getMarkdown();

      expect(saved).toBe(createTableMarkdown(editedCell));

      const reopened = await mountProjectionEditor(saved);

      setSelectionAtDocumentEnd(reopened.view);

      expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
    },
  );

  describe("where a strong fragment meets a code span", () => {
    const cell = String.raw`a **bee**${CODE}x \| sea${CODE} d`;

    it("shows the escaped pipe the code span holds and saves it unchanged", async () => {
      const markdown = createTableMarkdown(cell);
      const mounted = await mountProjectionEditor(markdown);

      enterProjection(mounted, "bee", "bee".length);

      expect(getTableCellTexts(mounted)[1][0]).toBe(cell);
      expect(mounted.getMarkdown()).toBe(markdown);
    });

    // Moving the caret off the seam hands the projection to the code span alone, so the edit is
    // typed at the seam.
    it("commits an edit typed at the seam", async () => {
      const editedCell = cell.replace("**bee**", "**bee**Z");
      const mounted = await mountProjectionEditor(createTableMarkdown(cell));

      enterProjection(mounted, "bee", "bee".length);
      typeText(mounted.view, "Z");

      expect(getTableCellTexts(mounted)[1][0]).toBe(editedCell);

      setSelectionAtDocumentEnd(mounted.view);

      const saved = mounted.getMarkdown();

      expect(saved).toBe(createTableMarkdown(editedCell));

      const reopened = await mountProjectionEditor(saved);

      setSelectionAtDocumentEnd(reopened.view);

      expect(reopened.view.state.doc.toJSON()).toEqual(mounted.view.state.doc.toJSON());
    });
  });

  it("shows the escaped pipe a link in a header cell holds", async () => {
    const cell = String.raw`a [bee \| sea](./doc.md) d`;
    const markdown = `| ${cell} |\n| ${"-".repeat(cell.length)} |\n| ${"x".padEnd(cell.length)} |\n\nend\n`;
    const mounted = await mountProjectionEditor(markdown);

    enterProjection(mounted, "bee");

    expect(getTableCellTexts(mounted)[0][0]).toBe(cell);
    expect(mounted.getMarkdown()).toBe(markdown);
  });

  it.each([
    { name: "a link", source: "[bee | sea](./doc.md)" },
    { name: "a strong fragment", source: "**bee | sea**" },
    { name: "a code span", source: `${CODE}bee | sea${CODE}` },
  ])("leaves the pipe $name holds outside a table unescaped", async ({ source }) => {
    const mounted = await mountProjectionEditor(`a ${source} d\n\nend\n`);

    enterProjection(mounted, "bee");

    expect(mounted.view.state.doc.firstChild?.textContent).toBe(`a ${source} d`);
  });
});
