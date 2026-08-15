import { describe, expect, it } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

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

  it("keeps source the file escaped literal when the caret visits it", async () => {
    const mounted = await mountProjectionEditor("\\[test link](./test.html) tail");

    setTextSelection(mounted.view, 12);
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("\\[test link]\\(./test.html) tail\n");
  });

  it("keeps source the file escaped literal when the paragraph is edited elsewhere", async () => {
    const mounted = await mountProjectionEditor("\\[test link](./test.html) tail");

    setTextSelection(mounted.view, 1);
    typeText(mounted.view, "edit ");
    setSelectionAtDocumentEnd(mounted.view);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("edit \\[test link]\\(./test.html) tail\n");
  });

  it("reverts a commit through undo and leaves it reverted", async () => {
    const mounted = await mountProjectionEditor("start");

    typeAtDocumentEnd(mounted, " [test link](./test.html) tail");

    expect(getLinkTargets(mounted)).toEqual(["./test.html"]);
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);

    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("start \\[test link]\\(./test.html)\n");
  });

  it("leaves typed source in a code block literal", async () => {
    const mounted = await mountProjectionEditor("```\ncode\n```");

    typeAtDocumentEnd(mounted, " [test link](./test.html)");
    setTextSelection(mounted.view, 1);

    expect(getLinkTargets(mounted)).toEqual([]);
    expect(mounted.getMarkdown()).toBe("```\ncode [test link](./test.html)\n```\n");
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
