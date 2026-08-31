// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  containsNodeType,
  getEditorTextContent,
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";
import { enterProjection } from "@/test/utils/sourceProjection";

import { runEditorCommand } from "../commands";
import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const typedLinkSourceFixtures = [
  { name: "inline link", target: "./test.html", typed: "[test link](./test.html)" },
  { name: "autolink literal", target: "https://example.com", typed: "https://example.com" },
  { name: "URI autolink", target: "https://example.com", typed: "<https://example.com>" },
];

const getLinkTargets = (mounted: MountedMilkdownEditor) =>
  Array.from(mounted.view.dom.querySelectorAll("a"), (link) => link.getAttribute("href"));

const dispatchDropEvent = (target: EventTarget, moved: boolean) => {
  const event = new Event("drop", { bubbles: true, cancelable: true });

  Object.assign(event, {
    clientX: 0,
    clientY: 0,
    ctrlKey: !moved,
    dataTransfer: {
      dropEffect: moved ? "move" : "copy",
      effectAllowed: "all",
      getData: () => "",
      types: [],
    },
    metaKey: false,
  });

  target.dispatchEvent(event);
};

const typeAtDocumentEnd = (mounted: MountedMilkdownEditor, text: string) => {
  setSelectionAtDocumentEnd(mounted.view);
  typeText(mounted.view, text);
};

describe("typed link source", () => {
  it.each(typedLinkSourceFixtures)(
    "commits a typed $name when the caret leaves it",
    async ({ target, typed }) => {
      const mounted = await mountProjectionEditor("start");

      typeAtDocumentEnd(mounted, ` ${typed}`);

      expect(getLinkTargets(mounted)).toEqual([]);

      setTextSelection(mounted.view, 1);

      expect(getLinkTargets(mounted)).toEqual([target]);
      expect(mounted.getMarkdown()).toBe(`start ${typed}\n`);
    },
  );

  it.each(typedLinkSourceFixtures)(
    "commits a typed $name when the sentence continues past it",
    async ({ target, typed }) => {
      const mounted = await mountProjectionEditor("start");

      typeAtDocumentEnd(mounted, ` ${typed} tail`);

      expect(getLinkTargets(mounted)).toEqual([target]);
      expect(mounted.getMarkdown()).toBe(`start ${typed} tail\n`);
    },
  );

  it("commits typed image source when the caret leaves it", async () => {
    const mounted = await mountProjectionEditor("start");

    typeAtDocumentEnd(mounted, " ![alt](x.png)");

    expect(containsNodeType(mounted, "image")).toBe(false);

    setTextSelection(mounted.view, 1);

    expect(containsNodeType(mounted, "image")).toBe(true);
    expect(mounted.getMarkdown()).toBe("start ![alt](x.png)\n");
  });

  // The parser reads `https://example.com/path.` as a link that stops before the dot.
  it("commits a typed URL once, at its full length", async () => {
    const mounted = await mountProjectionEditor("start");

    typeAtDocumentEnd(mounted, " https://example.com/path.html");
    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual(["https://example.com/path.html"]);
    expect(mounted.getMarkdown()).toBe("start https://example.com/path.html\n");
  });

  it.each([
    { name: "Enter", shiftKey: false },
    { name: "Shift+Enter", shiftKey: true },
  ])("commits typed source through $name", async ({ shiftKey }) => {
    const mounted = await mountProjectionEditor("start");

    typeAtDocumentEnd(mounted, " [test link](./test.html)");
    runKeyDownHandlers(mounted.view, "Enter", { shiftKey });
    typeText(mounted.view, "tail");

    expect(getLinkTargets(mounted)).toEqual(["./test.html"]);
    expect(mounted.getMarkdown()).toBe(
      shiftKey
        ? "start [test link](./test.html)\\\ntail\n"
        : "start [test link](./test.html)\n\ntail\n",
    );
  });

  it.each([
    { name: "backslash-escaped source", typed: "\\[test link](./test.html)" },
    { name: "incomplete source", typed: "[test link] (./test.html)" },
  ])("leaves $name literal", async ({ typed }) => {
    const mounted = await mountProjectionEditor("start");

    typeAtDocumentEnd(mounted, ` ${typed}`);
    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(getEditorTextContent(mounted)).toBe(`start ${typed}`);
  });

  it("keeps source an escape in projection wrote literal through later caret moves", async () => {
    const mounted = await mountProjectionEditor("[test link](./test.html) tail");

    enterProjection(mounted, "a");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "[test link](./test.html)"));
    typeText(mounted.view, "\\");
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual([]);

    setTextSelection(mounted.view, 3);
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("\\[test link](./test.html) tail\n");
  });

  it("keeps source an escape in projection wrote literal when it is edited inside", async () => {
    const mounted = await mountProjectionEditor("[test link](./test.html) tail");

    enterProjection(mounted, "a");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "[test link](./test.html)"));
    typeText(mounted.view, "\\");
    setSelectionAtDocumentEnd(mounted.view);

    const linkStart = getEditorTextPosition(mounted, "[test link](./test.html)");

    setTextSelection(mounted.view, linkStart + 1);
    typeText(mounted.view, "X");
    setSelectionAtDocumentEnd(mounted.view);

    expect(getEditorTextContent(mounted)).toBe("[Xtest link](./test.html) tail");
    expect(getLinkTargets(mounted)).toEqual([]);
  });

  it("keeps source the file escaped literal when the caret visits it", async () => {
    const mounted = await mountProjectionEditor("\\[test link](./test.html) tail");

    setTextSelection(mounted.view, 12);
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("\\[test link](./test.html) tail\n");
  });

  it("keeps source the file escaped literal when the paragraph is edited elsewhere", async () => {
    const mounted = await mountProjectionEditor("\\[test link](./test.html) tail");

    setTextSelection(mounted.view, 1);
    typeText(mounted.view, "edit ");
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("edit \\[test link](./test.html) tail\n");
  });

  it("keeps source the file escaped literal when it is edited inside", async () => {
    const mounted = await mountProjectionEditor("\\[test link](./test.html) tail");

    setTextSelection(mounted.view, 6);
    typeText(mounted.view, "ed");
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("\\[tested link](./test.html) tail\n");
  });

  // Auto-pairing around a selection is one change that writes on both sides of it.
  it("keeps source the file escaped literal when one change writes into it twice", async () => {
    const mounted = await mountProjectionEditor("\\[test link](./test.html) tail");

    mounted.view.dispatch(mounted.view.state.tr.insertText("(", 6).insertText(")", 11));
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("\\[test( lin)k](./test.html) tail\n");
  });

  it.each([
    { moved: true, name: "moved" },
    { moved: false, name: "copied" },
  ])("keeps source the file escaped literal when a word is $name into it", async ({ moved }) => {
    const mounted = await mountProjectionEditor("\\[test link](./test.html) tail");
    const { view } = mounted;

    setTextSelection(view, 26, 30);
    view.posAtCoords = () => ({ inside: -1, pos: 7 });
    view.dragging = { move: moved, slice: view.state.doc.slice(26, 30) };
    dispatchDropEvent(view.dom, moved);
    setSelectionAtDocumentEnd(view);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe(
      moved ? "\\[test taillink](./test.html)\n" : "\\[test taillink](./test.html) tail\n",
    );
  });

  // Restructuring a table rebuilds every cell in it, including the ones the session never touched.
  describe("with source the file escaped in a table cell", () => {
    const mountTableEditor = () =>
      mountProjectionEditor(
        "| a | b |\n| --- | --- |\n| \\[test link](./test.html) tail | c |\n| d | e |\n| f | g |",
      );
    const escapedCellRow = "| \\[test link](./test.html) tail | c |";

    it.each(["format.table.moveRowDown", "format.table.moveColumnRight"] as const)(
      "keeps it literal through %s from the cell",
      async (commandId) => {
        const mounted = await mountTableEditor();

        setTextSelection(mounted.view, 20);
        await runEditorCommand(mounted.editor, commandId);
        setSelectionAtDocumentEnd(mounted.view);

        expect(getLinkTargets(mounted)).toEqual([]);
      },
    );

    it("keeps it literal when the caret returns to the cell later", async () => {
      const mounted = await mountTableEditor();

      setTextSelection(mounted.view, 20);
      await runEditorCommand(mounted.editor, "format.table.addRowBelow");
      setSelectionAtDocumentEnd(mounted.view);
      setTextSelection(mounted.view, 20);
      setSelectionAtDocumentEnd(mounted.view);

      expect(getLinkTargets(mounted)).toEqual([]);
      expect(mounted.getMarkdown()).toContain(escapedCellRow);
    });

    it("keeps it literal when another row is moved", async () => {
      const mounted = await mountTableEditor();

      setSelectionAtDocumentEnd(mounted.view);
      await runEditorCommand(mounted.editor, "format.table.moveRowUp");
      setTextSelection(mounted.view, 20);
      setSelectionAtDocumentEnd(mounted.view);

      expect(getLinkTargets(mounted)).toEqual([]);
      expect(mounted.getMarkdown()).toContain(escapedCellRow);
    });

    it("still commits source typed into a cell after the table is restructured", async () => {
      const mounted = await mountTableEditor();

      setTextSelection(mounted.view, 20);
      await runEditorCommand(mounted.editor, "format.table.addRowBelow");
      setSelectionAtDocumentEnd(mounted.view);
      typeText(mounted.view, " [typed](./typed.html) ");

      expect(getLinkTargets(mounted)).toEqual(["./typed.html"]);
    });
  });

  it("commits source the file escaped once it is replaced outright", async () => {
    const mounted = await mountProjectionEditor("\\[test link](./test.html) tail");

    mounted.view.dispatch(mounted.view.state.tr.delete(1, 25));
    setTextSelection(mounted.view, 1);
    typeText(mounted.view, "[test link](./test.html)");
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual(["./test.html"]);
    expect(mounted.getMarkdown()).toBe("[test link](./test.html) tail\n");
  });

  it("commits source written by hand around words the file already held", async () => {
    const mounted = await mountProjectionEditor("test link tail", {
      autoPairBracketsAndQuotes: false,
    });

    setTextSelection(mounted.view, 1);
    typeText(mounted.view, "[");
    setTextSelection(mounted.view, 11);
    typeText(mounted.view, "](./test.html)");
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual(["./test.html"]);
    expect(mounted.getMarkdown()).toBe("[test link](./test.html) tail\n");
  });

  it("reverts a commit through undo and leaves it reverted", async () => {
    const mounted = await mountProjectionEditor("start");

    typeAtDocumentEnd(mounted, " [test link](./test.html) tail");

    expect(getLinkTargets(mounted)).toEqual(["./test.html"]);
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);

    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("start \\[test link](./test.html)\n");
  });

  it("leaves typed source in a code block literal", async () => {
    const mounted = await mountProjectionEditor("```\ncode\n```");

    typeAtDocumentEnd(mounted, " [test link](./test.html)");
    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("```\ncode [test link](./test.html)\n```\n");
  });

  it("leaves typed source split by a line ending literal", async () => {
    const mounted = await mountProjectionEditor("start");

    typeAtDocumentEnd(mounted, " [test link");
    runKeyDownHandlers(mounted.view, "Enter", { shiftKey: true });
    typeText(mounted.view, "](./test.html) tail");

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("start \\[test link\\\n](./test.html) tail\n");
  });

  it.each(typedLinkSourceFixtures)(
    "reaches the same document typing or pasting a $name",
    async ({ typed }) => {
      const typedEditor = await mountProjectionEditor("start");

      typeAtDocumentEnd(typedEditor, ` ${typed}`);
      setTextSelection(typedEditor.view, 1);

      const pastedEditor = await mountProjectionEditor("start");

      typeAtDocumentEnd(pastedEditor, " ");
      dispatchClipboardEvent(pastedEditor.view.dom, "paste", { [TEXT_PLAIN_MIME_TYPE]: typed });
      setTextSelection(pastedEditor.view, 1);

      expect(typedEditor.view.state.doc.toString()).toBe(pastedEditor.view.state.doc.toString());
      expect(typedEditor.getMarkdown()).toBe(pastedEditor.getMarkdown());
    },
  );

  it("projects a committed link as the source it was typed as", async () => {
    const mounted = await mountProjectionEditor("start");

    typeAtDocumentEnd(mounted, " [test link](./test.html)");
    setTextSelection(mounted.view, 1);
    setTextSelection(mounted.view, 9);

    expect(getEditorTextContent(mounted)).toBe("start [test link](./test.html)");
  });

  it("projects the link the caret lands in while committing the run it left", async () => {
    const mounted = await mountProjectionEditor("[first](./first.md) start");

    typeAtDocumentEnd(mounted, " [test link](./test.html)");
    setTextSelection(mounted.view, 3);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("[first](./first.md) start test link");
    expect(mounted.getMarkdown()).toBe("[first](./first.md) start [test link](./test.html)\n");
  });
});
