// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});
const MULTILINE_MARK_SOURCE = "**one\ntwo**";

describe("multiline marked fragment source projection", () => {
  it.each([
    { line: "one", offset: 1 },
    { line: "two", offset: 1 },
  ])("projects the whole fragment from the $line side of its break", async ({ line, offset }) => {
    const mounted = await mountProjectionEditor(MULTILINE_MARK_SOURCE);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, line) + offset);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(MULTILINE_MARK_SOURCE);
  });

  it.each([
    { label: "a plain fragment", source: MULTILINE_MARK_SOURCE },
    {
      label: "a fragment holding a footnote reference",
      source: "**one\ntwo[^n]**\n\n[^n]: Detail",
    },
  ])("restores $label unchanged when nothing is edited", async ({ source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);

    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  it("commits an edit to a multiline fragment as one mark", async () => {
    const mounted = await mountProjectionEditor(MULTILINE_MARK_SOURCE);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + "one".length);
    typeText(mounted.view, "X");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("**oneX\ntwo**\n");
    expect(getEditorNodePosition(mounted, "hardbreak")).toBeGreaterThan(0);
  });

  it.each([
    {
      label: "a soft line ending and a footnote reference",
      markdown: "**one\ntwo[^n]**\n\n[^n]: Detail",
      source: "**one\ntwo[^n]**",
    },
    {
      label: "a hard break, a soft line ending, and a link",
      markdown: "**one [link](./doc.md)\\\ntwo\nthree**",
      source: "**one [link](./doc.md)\\\ntwo\nthree**",
    },
  ])(
    "commits an edit to a fragment holding $label with every object intact",
    async ({ markdown, source }) => {
      const mounted = await mountProjectionEditor(markdown);

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);
      setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + "one".length);
      typeText(mounted.view, "X");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe(
        `${markdown.replace(source, source.replace("one", "oneX"))}\n`,
      );
      expect(mounted.view.dom.querySelectorAll("strong")).toHaveLength(1);
    },
  );
});

describe("marked fragment source projection across an authored hard break", () => {
  const HARD_BREAK_RUNS = [
    { run: "\\", spelling: "a backslash" },
    { run: "  ", spelling: "a run of spaces" },
  ];
  const getSource = (run: string) => `**one${run}\ntwo**`;
  const getHardBreak = (mounted: MountedMilkdownEditor) =>
    mounted.view.state.doc.nodeAt(
      getEditorNodePosition(mounted, "hardbreak", (node) => node.attrs.isInline === false),
    );

  it.each(
    HARD_BREAK_RUNS.flatMap((spelling) => ["one", "two"].map((line) => ({ ...spelling, line }))),
  )("projects one fragment from the $line side of $spelling", async ({ line, run }) => {
    const source = getSource(run);
    const mounted = await mountProjectionEditor(`Before ${source} after`);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, line) + 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`Before ${source} after`);
  });

  it.each(HARD_BREAK_RUNS.flatMap((spelling) => [0, 1].map((offset) => ({ ...spelling, offset }))))(
    "keeps the caret on its side of $spelling at offset $offset",
    async ({ offset, run }) => {
      const source = getSource(run);
      const mounted = await mountProjectionEditor(`Before ${source} after`);
      const breakPosition = getEditorNodePosition(
        mounted,
        "hardbreak",
        (node) => node.attrs.isInline === false,
      );

      setTextSelection(mounted.view, breakPosition + offset);

      const sourceOffset = offset ? source.indexOf("\n") + 1 : source.indexOf(run);

      expect(mounted.view.state.selection.head).toBe(
        getEditorTextPosition(mounted, source) + sourceOffset,
      );
    },
  );

  it.each(HARD_BREAK_RUNS)(
    "commits a soft line ending once the run of $spelling no longer spells a break",
    async ({ run }) => {
      const source = getSource(run);
      const mounted = await mountProjectionEditor(`Before ${source} after`);

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);
      setTextSelection(
        mounted.view,
        getEditorTextPosition(mounted, `one${run}`) + "one".length + 1,
      );
      runKeyDownHandlers(mounted.view, "Backspace");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe("Before **one\ntwo** after\n");
      expect(
        getEditorNodePosition(mounted, "hardbreak", (node) => node.attrs.isInline === true),
      ).toBeGreaterThan(0);
    },
  );

  it.each(HARD_BREAK_RUNS)("restores the original fragment across $spelling", async ({ run }) => {
    const mounted = await mountProjectionEditor(`Before ${getSource(run)} after`);
    const originalDocument = mounted.view.state.doc;

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "two") + 1);
    setSelectionAtDocumentEnd(mounted.view);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
  });

  it.each(HARD_BREAK_RUNS)(
    "commits an edit as one mark keeping the run of $spelling",
    async ({ run }) => {
      const source = getSource(run);
      const mounted = await mountProjectionEditor(`Before ${source} after`);

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);
      setTextSelection(mounted.view, getEditorTextPosition(mounted, "two") + "two".length);
      typeText(mounted.view, "X");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe(`Before ${source.replace("two", "twoX")} after\n`);
      expect(getHardBreak(mounted)?.attrs.run).toBe(run);
      expect(mounted.view.dom.querySelectorAll("strong")).toHaveLength(1);
    },
  );

  it.each(HARD_BREAK_RUNS)(
    "commits a broken wrapper holding $spelling as the literal text it spells",
    async ({ run }) => {
      const source = getSource(run);
      const mounted = await mountProjectionEditor(`Before ${source} after`);

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);
      setTextSelection(mounted.view, getEditorTextPosition(mounted, "two") + "two".length);
      typeText(mounted.view, " ");
      setSelectionAtDocumentEnd(mounted.view);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
      expect(mounted.view.dom.querySelector("strong, em")).not.toBeInTheDocument();
      expect(getEditorTextContent(mounted)).toBe(`Before ${source.replace("two", "two ")} after`);
    },
  );

  it.each(HARD_BREAK_RUNS)(
    "leaves $spelling at the edge of its run outside the fragment",
    async ({ run }) => {
      const mounted = await mountProjectionEditor(`Before **one${run}\ntwo** after`);
      const twoFrom = getEditorTextPosition(mounted, "two");

      mounted.view.dispatch(mounted.view.state.tr.delete(twoFrom, twoFrom + "two".length));
      setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);

      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toBe(`Before **one**\n after`);

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + "one".length);
      typeText(mounted.view, "X");
      setSelectionAtDocumentEnd(mounted.view);

      expect(getHardBreak(mounted)?.attrs.run).toBe(run);
      expect(mounted.view.dom.querySelector("strong")).toHaveTextContent("oneX");
    },
  );

  it.each(HARD_BREAK_RUNS)(
    "shows the run of $spelling as a marker, marking each space",
    async ({ run }) => {
      const mounted = await mountProjectionEditor(`Before ${getSource(run)} after`);

      setTextSelection(mounted.view, getEditorTextPosition(mounted, "one") + 1);

      expect(
        Array.from(
          mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker--break-spaces"),
          (element) => element.textContent,
        ),
      ).toEqual(run === "\\" ? [] : [run]);
      expect(
        Array.from(
          mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker"),
          (element) => element.textContent,
        ).join(""),
      ).toContain(`${run}\n`);
    },
  );
});
