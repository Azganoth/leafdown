// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  findEditorTextNode,
  getEditorTextContent,
  getEditorTextPosition,
  getMarkNames,
  runKeyDownHandlers,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import {
  hasActiveSourceProjection,
  leafdownSourceProjectionPluginKey,
} from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});

const FOOTNOTE_DEFINITIONS = "\n\n[^one]: first\n\n[^two]: second";

// Every fixture reads `Z <left><right> Z`, so the two objects meet where the second one begins,
// which is the child before the one holding the trailing `Z`. Reading it from the children rather
// than from the rendered text keeps the atomic references, which render no text of their own.
const getSeamPosition = (mounted: MountedMilkdownEditor) => {
  const paragraph = mounted.view.state.doc.firstChild;
  const starts: number[] = [];
  let offset = 1;

  paragraph?.forEach((node) => {
    starts.push(offset);
    offset += node.nodeSize;
  });

  return starts[starts.length - 2];
};

const getParagraphText = (mounted: MountedMilkdownEditor) =>
  mounted.view.state.doc.firstChild?.textContent ?? "";

const getMarkerTexts = (mounted: MountedMilkdownEditor) =>
  Array.from(
    mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker"),
    (node) => node.textContent,
  );

// The character a projected reference names is drawn from an attribute rather than written into
// the document, so the rendered line reads as the source with each preview marked where it stands.
const getProjectedLineText = (mounted: MountedMilkdownEditor) => {
  const read = (node: Node): string =>
    Array.from(node.childNodes, (child) => {
      if (!(child instanceof HTMLElement)) {
        return child.textContent ?? "";
      }

      const preview = child.dataset.leafdownPreview;

      return preview === undefined ? read(child) : `[${preview}]`;
    }).join("");

  return read(mounted.view.dom);
};

const getProjectionSession = (mounted: MountedMilkdownEditor) =>
  leafdownSourceProjectionPluginKey.getState(mounted.view.state)?.session ?? null;

const getProjectedSource = (mounted: MountedMilkdownEditor) =>
  getProjectionSession(mounted)?.target.originalSource ?? null;

const getProjectionAdapterId = (mounted: MountedMilkdownEditor) =>
  getProjectionSession(mounted)?.adapter.id ?? null;

const enterBoundary = (mounted: MountedMilkdownEditor) => {
  setTextSelection(mounted.view, getSeamPosition(mounted));

  return mounted.view.state.selection.from;
};

const leaveProjection = (mounted: MountedMilkdownEditor) => {
  setTextSelection(mounted.view, 1);
};

const BOUNDARY_PAIRS = [
  { kind: "two links", pair: "[ab](x)[cd](y)", tail: "" },
  { kind: "two marked fragments", pair: "*ab***cd**", tail: "" },
  { kind: "two marked fragments of different marks", pair: "**ab**~~cd~~", tail: "" },
  { kind: "a code span and a marked fragment", pair: "`ab`*cd*", tail: "" },
  { kind: "a link and a marked fragment", pair: "[ab](x)*cd*", tail: "" },
  { kind: "a marked fragment and a link", pair: "*ab*[cd](y)", tail: "" },
  { kind: "a link and a character reference", pair: "[ab](x)&copy;", tail: "" },
  { kind: "two character references", pair: "&copy;&reg;", tail: "" },
  { kind: "a marked fragment and a character reference", pair: "*ab*&copy;", tail: "" },
  { kind: "a character reference and a link", pair: "&copy;[ab](x)", tail: "" },
  { kind: "two footnote references", pair: "[^one][^two]", tail: FOOTNOTE_DEFINITIONS },
  { kind: "a link and a footnote reference", pair: "[ab](x)[^one]", tail: FOOTNOTE_DEFINITIONS },
  { kind: "a footnote reference and a link", pair: "[^one][cd](y)", tail: FOOTNOTE_DEFINITIONS },
];

describe("boundary source projection", () => {
  it.each(BOUNDARY_PAIRS)("projects both objects across $kind", async ({ pair, tail }) => {
    const mounted = await mountProjectionEditor(`Z ${pair} Z${tail}`);

    enterBoundary(mounted);

    expect(getProjectionAdapterId(mounted)).toBe("boundary");
    expect(getProjectedSource(mounted)).toBe(pair);
    expect(getParagraphText(mounted)).toBe(`Z ${pair} Z`);
  });

  it.each(BOUNDARY_PAIRS)(
    "restores both rendered forms across $kind when they are left unchanged",
    async ({ pair, tail }) => {
      const markdown = `Z ${pair} Z${tail}`;
      const mounted = await mountProjectionEditor(markdown);
      const rendered = getParagraphText(mounted);

      enterBoundary(mounted);
      leaveProjection(mounted);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(getParagraphText(mounted)).toBe(rendered);
      expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
    },
  );

  it("presents each object's own markers across the pair", async () => {
    const mounted = await mountProjectionEditor("Z [ab](x)*cd* Z");

    enterBoundary(mounted);

    // Each side keeps the styling it has on its own: the link's brackets and destination and the
    // emphasis delimiters read as markers, while the label and the emphasised text read as content.
    expect(getMarkerTexts(mounted)).toEqual(["[", "](x)", "*", "*"]);
  });

  it("keeps a projected reference's character beside its source across the pair", async () => {
    const mounted = await mountProjectionEditor("Z *ab*&copy; Z");

    enterBoundary(mounted);

    expect(getProjectedLineText(mounted)).toBe("Z *ab*[©]&copy; Z");
  });

  it("opens the sources around the caret rather than moving it", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");

    const caret = enterBoundary(mounted);

    // The caret keeps its place between the two objects, which is where the first source ends and
    // the second begins.
    expect(caret).toBe(getEditorTextPosition(mounted, "*ab*") + "*ab*".length);
  });

  it("reaches the same state from the left and from the right", async () => {
    const fromLeft = await mountProjectionEditor("Z *ab***cd** Z");
    const fromRight = await mountProjectionEditor("Z *ab***cd** Z");
    const seam = getSeamPosition(fromLeft);

    setTextSelection(fromLeft.view, seam - 1);
    setTextSelection(fromLeft.view, 1);
    setTextSelection(fromLeft.view, seam);

    setTextSelection(fromRight.view, seam + 1);
    setTextSelection(fromRight.view, 1);
    setTextSelection(fromRight.view, seam);

    expect(getProjectedSource(fromLeft)).toBe("*ab***cd**");
    expect(getProjectedSource(fromRight)).toBe("*ab***cd**");
    expect(getEditorTextContent(fromLeft)).toBe(getEditorTextContent(fromRight));
    expect(fromLeft.view.state.selection.from).toBe(fromRight.view.state.selection.from);
  });

  it("gives way to the first object when the caret moves into it", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");
    const caret = enterBoundary(mounted);

    setTextSelection(mounted.view, caret - 2);

    expect(getProjectionAdapterId(mounted)).toBe("mark");
    expect(getProjectedSource(mounted)).toBe("*ab*");
    expect(getParagraphText(mounted)).toBe("Z *ab*cd Z");
  });

  it("gives way to the second object when the caret moves into it", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");
    const caret = enterBoundary(mounted);

    setTextSelection(mounted.view, caret + 3);

    expect(getProjectionAdapterId(mounted)).toBe("mark");
    expect(getProjectedSource(mounted)).toBe("**cd**");
    expect(getParagraphText(mounted)).toBe("Z ab**cd** Z");
  });

  it("keeps both open while the caret moves through the delimiters they meet at", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");
    const caret = enterBoundary(mounted);

    // The delimiters on either side of the place the two meet hold no document position of their
    // own, so a caret moving through them has not reached either object's content yet.
    for (const offset of [-1, 1, 2]) {
      setTextSelection(mounted.view, caret + offset);

      expect(getProjectionAdapterId(mounted)).toBe("boundary");
      expect(mounted.view.state.selection.from).toBe(caret + offset);
    }
  });

  it("keeps both open while the caret moves inside the text written between them", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");

    enterBoundary(mounted);
    typeText(mounted.view, "X");
    typeText(mounted.view, "Y");
    setTextSelection(mounted.view, mounted.view.state.selection.from - 1);

    expect(getProjectionAdapterId(mounted)).toBe("boundary");
    expect(getParagraphText(mounted)).toBe("Z *ab*XY**cd** Z");
  });

  it("commits an edit inside one object and leaves its neighbour whole", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");
    const caret = enterBoundary(mounted);

    // Moving into the second object hands it the caret, and the pair restores as the file held it.
    setTextSelection(mounted.view, caret + 3);
    typeText(mounted.view, "Q");
    leaveProjection(mounted);

    expect(mounted.getMarkdown()).toBe("Z *ab***cQd** Z\n");
    expect(getEditorTextContent(mounted)).toBe("Z abcQd Z");
  });

  it("commits an edit that breaks one object as the file reads it and keeps the other", async () => {
    const mounted = await mountProjectionEditor("Z **ab**~~cd~~ Z");

    enterBoundary(mounted);
    // The seam belongs to neither object, so Backspace takes the last character of the source
    // before it, which is the first object's own closing delimiter.
    runKeyDownHandlers(mounted.view, "Backspace");

    expect(getParagraphText(mounted)).toBe("Z **ab*~~cd~~ Z");

    leaveProjection(mounted);

    expect(mounted.getMarkdown()).toBe("Z **ab*~~cd~~ Z\n");
    expect(getMarkNames(findEditorTextNode(mounted, "cd")!)).toEqual(["strike_through"]);
    expect(findEditorTextNode(mounted, "Z **ab*")).not.toBeNull();
  });

  it("writes a character at the seam as text between the two objects", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");

    enterBoundary(mounted);
    typeText(mounted.view, "X");

    expect(getParagraphText(mounted)).toBe("Z *ab*X**cd** Z");

    leaveProjection(mounted);

    expect(mounted.getMarkdown()).toBe("Z *ab*X**cd** Z\n");
    expect(getMarkNames(findEditorTextNode(mounted, "ab")!)).toEqual(["emphasis"]);
    expect(getMarkNames(findEditorTextNode(mounted, "cd")!)).toEqual(["strong"]);
    expect(getMarkNames(findEditorTextNode(mounted, "X")!)).toEqual([]);
  });

  it("pastes at the seam between the two objects", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");

    enterBoundary(mounted);
    dispatchClipboardEvent(mounted.view.dom, "paste", { "text/plain": "XY" });

    expect(getParagraphText(mounted)).toBe("Z *ab*XY**cd** Z");

    leaveProjection(mounted);

    expect(mounted.getMarkdown()).toBe("Z *ab*XY**cd** Z\n");
  });

  it("deletes the character before the seam with Backspace", async () => {
    const mounted = await mountProjectionEditor("Z **ab**~~cd~~ Z");

    enterBoundary(mounted);
    runKeyDownHandlers(mounted.view, "Backspace");

    expect(getParagraphText(mounted)).toBe("Z **ab*~~cd~~ Z");
  });

  it("deletes the character after the seam with Delete", async () => {
    const mounted = await mountProjectionEditor("Z **ab**~~cd~~ Z");

    enterBoundary(mounted);
    runKeyDownHandlers(mounted.view, "Delete");

    expect(getParagraphText(mounted)).toBe("Z **ab**~cd~~ Z");

    leaveProjection(mounted);

    // The object the deletion did not reach is still the object the file held.
    expect(getMarkNames(findEditorTextNode(mounted, "ab")!)).toEqual(["strong"]);
    expect(mounted.getMarkdown()).toBe("Z **ab**~cd~~ Z\n");
  });

  it("projects the link when the caret sits between two references in its label", async () => {
    const mounted = await mountProjectionEditor("Z [&copy;&reg;](x) Z");

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "®"));

    expect(getProjectionAdapterId(mounted)).toBe("link");
    expect(getProjectedSource(mounted)).toBe("[&copy;&reg;](x)");
  });

  it("projects the single owner a contained selection sits inside", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");
    const seam = getSeamPosition(mounted);

    setTextSelection(mounted.view, seam - 2, seam);

    expect(getProjectionAdapterId(mounted)).toBe("mark");
    expect(getProjectedSource(mounted)).toBe("*ab*");
  });

  it("steps back over boundary edits in the order they were written", async () => {
    const mounted = await mountProjectionEditor("Z *ab***cd** Z");

    enterBoundary(mounted);
    typeText(mounted.view, "X");
    typeText(mounted.view, "Y");

    expect(getEditorTextContent(mounted)).toBe("Z *ab*XY**cd** Z");

    await runEditorCommand(mounted.editor, "edit.undo");

    expect(getEditorTextContent(mounted)).toBe("Z *ab*X**cd** Z");

    await runEditorCommand(mounted.editor, "edit.undo");

    expect(getEditorTextContent(mounted)).toBe("Z *ab***cd** Z");
    expect(getProjectionAdapterId(mounted)).toBe("boundary");

    await runEditorCommand(mounted.editor, "edit.redo");

    expect(getEditorTextContent(mounted)).toBe("Z *ab*X**cd** Z");
  });

  it("projects a boundary whose side is an escaped literal run", async () => {
    const markdown = String.raw`Z \[ab](x)*cd* Z`;
    const mounted = await mountProjectionEditor(markdown);

    expect(getEditorTextContent(mounted)).toBe("Z [ab](x)cd Z");

    enterBoundary(mounted);

    expect(getProjectionAdapterId(mounted)).toBe("boundary");
    expect(getEditorTextContent(mounted)).toBe(String.raw`Z \[ab](x)*cd* Z`);

    leaveProjection(mounted);

    expect(mounted.getMarkdown()).toBe(`${markdown}\n`);
  });

  it("gives way to an escaped side that then converts when its backslash is deleted", async () => {
    const mounted = await mountProjectionEditor(String.raw`Z \[ab](x)*cd* Z`);
    const seam = enterBoundary(mounted);

    setTextSelection(mounted.view, seam - 4);

    expect(getProjectionAdapterId(mounted)).toBe("escape");
    expect(getParagraphText(mounted)).toBe(String.raw`Z \[ab](x)cd Z`);

    setTextSelection(mounted.view, getProjectionSession(mounted)!.from + 1);
    runKeyDownHandlers(mounted.view, "Backspace");

    expect(getProjectionAdapterId(mounted)).toBe("link");
    expect(getEditorTextContent(mounted)).toBe("Z [ab](x)cd Z");
    expect(mounted.getMarkdown()).toBe("Z [ab](x)*cd* Z\n");
  });

  it("converts an escaped side at once when a deletion inside the pair spends its backslash", async () => {
    const mounted = await mountProjectionEditor(String.raw`Z \[ab](x)*cd* Z`);

    enterBoundary(mounted);

    const backslash = getProjectionSession(mounted)!.from;

    setTextSelection(mounted.view, backslash, backslash + 1);
    runKeyDownHandlers(mounted.view, "Backspace");

    expect(getProjectionAdapterId(mounted)).toBe("link");
    expect(getEditorTextContent(mounted)).toBe("Z [ab](x)cd Z");
    expect(mounted.getMarkdown()).toBe("Z [ab](x)*cd* Z\n");
  });
});
