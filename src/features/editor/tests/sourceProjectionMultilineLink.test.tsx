import { remarkCtx } from "@milkdown/kit/core";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  flushEditorDomObserver,
  getEditorDomTextNode,
  getEditorNodePosition,
  getSelectedEditorText,
  getEditorTextContent,
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import { hasActiveSourceProjection } from "../plugins/sourceProjection";
import { createLinkSourceMap } from "../utils/sourceProjectionLinkSyntax";

const mountProjectionEditor = setupMilkdownEditorMount({
  rootClassName: EDITOR_TEST_ROOT_CLASS_NAME,
});
const PLAIN_LINK_SOURCE = "[first field\nwalk](./nested-directory/doc-alternate.markdown)";
const MIXED_LINK_SOURCE =
  '[**calibration summary** with *field observations*, ~~retired wording~~,\nand `v2`](./article-navigator/01-overview.md "Calibration review")';
const MIXED_LINK_LABEL_SOURCE =
  "**calibration summary** with *field observations*, ~~retired wording~~,\nand `v2`";

const getInlineBreakPosition = (document: ProseMirrorNode) =>
  getEditorNodePosition(document, "hardbreak", (node) => node.attrs.isInline === true);

describe("multiline logical-link source projection", () => {
  it.each([
    { offset: 0, side: "before" },
    { offset: 1, side: "after" },
  ])("projects a plain link from the $side side of its soft break", async ({ offset }) => {
    const mounted = await mountProjectionEditor(`${PLAIN_LINK_SOURCE} plain`);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition + offset);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`${PLAIN_LINK_SOURCE} plain`);
    expect(mounted.view.dom.querySelector("[data-type='hardbreak']")).not.toBeInTheDocument();

    const sourceStart = getEditorTextPosition(mounted, PLAIN_LINK_SOURCE);
    const sourceBreakPosition = PLAIN_LINK_SOURCE.indexOf("\n");

    expect(mounted.view.state.selection.anchor).toBe(sourceStart + sourceBreakPosition + offset);
    expect(mounted.view.state.selection.head).toBe(sourceStart + sourceBreakPosition + offset);
  });

  it("maps whitespace before an inline break to the break source segment", async () => {
    const source = "[first field \nwalk](./nested-directory/doc-alternate.markdown)";
    const mounted = await mountProjectionEditor(source);
    const map = createLinkSourceMap(mounted.editor.ctx.get(remarkCtx), source);

    expect(map?.segments).toEqual([
      expect.objectContaining({
        documentFrom: 0,
        documentTo: 11,
        sourceFrom: 1,
        sourceTo: 12,
        type: "text",
      }),
      expect.objectContaining({
        documentFrom: 11,
        documentTo: 12,
        sourceFrom: 12,
        sourceTo: 14,
        type: "inlineBreak",
      }),
      expect.objectContaining({
        documentFrom: 12,
        documentTo: 16,
        sourceFrom: 14,
        sourceTo: 18,
        type: "text",
      }),
    ]);
  });

  it.each([
    {
      label: "Plain label",
      source: '[Plain label](./article.md "Title")',
    },
    {
      label: "**Bold** with *soft*, ~~old~~, and `code`",
      source: '[**Bold** with *soft*, ~~old~~, and `code`](./article.md "Title")',
    },
    {
      label: "**Bold** and *soft*",
      source: '**[**Bold** and *soft*](./article.md "Title")**',
    },
  ])(
    "maps the complete $label link label independently from surrounding syntax",
    async ({ label, source }) => {
      const mounted = await mountProjectionEditor(source);
      const map = createLinkSourceMap(mounted.editor.ctx.get(remarkCtx), source);

      expect(map).not.toBeNull();
      expect(source.slice(map!.labelFrom, map!.labelTo)).toBe(label);
      expect(source[map!.labelFrom - 1]).toBe("[");
      expect(source[map!.labelTo]).toBe("]");
    },
  );

  it("projects a mixed-format multiline label as one source object", async () => {
    const mounted = await mountProjectionEditor(MIXED_LINK_SOURCE);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(MIXED_LINK_SOURCE);
    expect(mounted.view.dom.querySelector("a, strong, em, del, code")).not.toBeInTheDocument();
  });

  it("coordinates mixed-format projected label presentation across a soft break", async () => {
    const mounted = await mountProjectionEditor(MIXED_LINK_SOURCE);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    const getLabelFragments = () =>
      Array.from(
        mounted.view.dom.querySelectorAll(".leafdown-source-projection__content--link-label"),
      );
    const firstFragment = getLabelFragments()[0];

    if (!firstFragment) {
      throw new Error("Expected projected mixed-link label presentation fragments.");
    }

    expect(
      getLabelFragments()
        .map((fragment) => fragment.textContent)
        .join(""),
    ).toBe(MIXED_LINK_LABEL_SOURCE);

    dispatchMouseEvent(firstFragment, "mouseover");

    expect(
      getLabelFragments().every((fragment) =>
        fragment.classList.contains("leafdown-source-projection__content--link-label-hovered"),
      ),
    ).toBe(true);
  });

  it.each([
    { content: "calibration summary", segment: "strong" },
    { content: "with", segment: "plain text" },
    { content: "field observations", segment: "emphasis" },
    { content: "retired wording", segment: "strikethrough" },
    { content: "v2", segment: "inline code" },
  ])("projects the complete mixed link from its $segment segment", async ({ content }) => {
    const mounted = await mountProjectionEditor(MIXED_LINK_SOURCE);
    const contentPosition = getEditorTextPosition(mounted, content) + 1;

    setTextSelection(mounted.view, contentPosition);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(MIXED_LINK_SOURCE);
  });

  it.each([
    { direction: "forward", reverse: false },
    { direction: "backward", reverse: true },
  ])("maps a $direction selection across the soft break", async ({ reverse }) => {
    const mounted = await mountProjectionEditor(`${PLAIN_LINK_SOURCE} plain`);
    const fieldFrom = getEditorTextPosition(mounted, "field");
    const walkTo = getEditorTextPosition(mounted, "walk") + "walk".length;

    setTextSelection(mounted.view, reverse ? walkTo : fieldFrom, reverse ? fieldFrom : walkTo);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getSelectedEditorText(mounted)).toBe("field\nwalk");
    expect(mounted.view.state.selection.anchor > mounted.view.state.selection.head).toBe(reverse);
  });

  it.each([
    {
      name: "relative destination with title",
      source: '[field notes\nsummary](./notes.md "Review")',
    },
    {
      name: "JavaScript destination",
      source: "[legacy script\nlink](javascript:alert)",
    },
  ])("keeps projection activation independent of the $name", async ({ source }) => {
    const mounted = await mountProjectionEditor(source);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(source);
  });

  it("restores the exact original document after a clean multiline projection", async () => {
    const mounted = await mountProjectionEditor(`${MIXED_LINK_SOURCE} plain`);
    const originalDocument = mounted.view.state.doc;
    const breakPosition = getInlineBreakPosition(originalDocument);

    setTextSelection(mounted.view, breakPosition + 1);
    setSelectionAtDocumentEnd(mounted.view);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.state.doc.eq(originalDocument)).toBe(true);
  });

  it("rehydrates valid edited multiline source as one rich link", async () => {
    const mounted = await mountProjectionEditor(`${MIXED_LINK_SOURCE} plain`);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    const summaryEnd =
      getEditorTextPosition(mounted, "calibration summary") + "calibration summary".length;

    setTextSelection(mounted.view, summaryEnd);
    typeText(mounted.view, " updated");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(
      `${MIXED_LINK_SOURCE.replace("calibration summary", "calibration summary updated")} plain\n`,
    );
    expect(mounted.view.dom.querySelector("strong")).toHaveTextContent(
      "calibration summary updated",
    );
    expect(mounted.view.dom.querySelector("em")).toHaveTextContent("field observations");
    expect(mounted.view.dom.querySelector("del")).toHaveTextContent("retired wording");
    expect(mounted.view.dom.querySelector("code")).toHaveTextContent("v2");

    const linkMarks = new Set<string>();

    mounted.view.state.doc.descendants((node) => {
      const linkMark = node.marks.find((mark) => mark.type.name === "link");

      if (linkMark) {
        linkMarks.add(JSON.stringify(linkMark.attrs));
      }

      return true;
    });

    expect(linkMarks).toEqual(
      new Set([
        JSON.stringify({
          href: "./article-navigator/01-overview.md",
          title: "Calibration review",
          isBareAutolink: false,
          authoredUrl: null,
        }),
      ]),
    );
    expect(getEditorNodePosition(mounted, "hardbreak")).toBeGreaterThan(0);
  });

  it("keeps the soft break when the browser rewrites the projected label", async () => {
    const mounted = await mountProjectionEditor(`${PLAIN_LINK_SOURCE} plain`);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    getEditorDomTextNode(mounted, "walk").data = "walkX";
    flushEditorDomObserver(mounted.view);
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${PLAIN_LINK_SOURCE.replace("walk", "walkX")} plain\n`);
    expect(getEditorNodePosition(mounted, "hardbreak")).toBeGreaterThan(0);
  });

  it("preserves an ambient mark that extends beyond a multiline link", async () => {
    const source = `*Before ${PLAIN_LINK_SOURCE} after*`;
    const mounted = await mountProjectionEditor(source);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`Before ${PLAIN_LINK_SOURCE} after`);

    const walkEnd = getEditorTextPosition(mounted, "walk") + "walk".length;

    setTextSelection(mounted.view, walkEnd);
    typeText(mounted.view, "!");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(
      `*Before ${PLAIN_LINK_SOURCE.replace("walk", "walk!")} after*\n`,
    );
    expect(getEditorNodePosition(mounted, "hardbreak")).toBeGreaterThan(0);

    const inlineNodes: ProseMirrorNode[] = [];

    mounted.view.state.doc.firstChild?.forEach((node) => inlineNodes.push(node));

    expect(inlineNodes).not.toHaveLength(0);
    expect(
      inlineNodes.every((node) => node.marks.some((mark) => mark.type.name === "emphasis")),
    ).toBe(true);
  });

  it("commits invalid multiline source as exact literal text", async () => {
    const mounted = await mountProjectionEditor(`${PLAIN_LINK_SOURCE} plain`);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    const sourceEnd = getEditorTextPosition(mounted, PLAIN_LINK_SOURCE) + PLAIN_LINK_SOURCE.length;

    setTextSelection(mounted.view, sourceEnd);
    runKeyDownHandlers(mounted.view, "Backspace");
    setSelectionAtDocumentEnd(mounted.view);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.dom.querySelector("a")).not.toBeInTheDocument();
    expect(getEditorTextContent(mounted)).toBe(`${PLAIN_LINK_SOURCE.slice(0, -1)} plain`);
  });

  it("uses projection-local undo and redo for multiline link edits", async () => {
    const mounted = await mountProjectionEditor(`${PLAIN_LINK_SOURCE} plain`);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    const walkEnd = getEditorTextPosition(mounted, "walk") + "walk".length;

    setTextSelection(mounted.view, walkEnd);
    typeText(mounted.view, "!");

    expect(getEditorTextContent(mounted)).toBe(
      `${PLAIN_LINK_SOURCE.replace("walk", "walk!")} plain`,
    );
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(`${PLAIN_LINK_SOURCE} plain`);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(
      `${PLAIN_LINK_SOURCE.replace("walk", "walk!")} plain`,
    );
  });

  it("preserves native undo and redo after committing a multiline link edit", async () => {
    const initialMarkdown = `${PLAIN_LINK_SOURCE} plain`;
    const editedMarkdown = `${PLAIN_LINK_SOURCE.replace("walk", "walk!")} plain\n`;
    const mounted = await mountProjectionEditor(initialMarkdown);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    const walkEnd = getEditorTextPosition(mounted, "walk") + "walk".length;

    setTextSelection(mounted.view, walkEnd);
    typeText(mounted.view, "!");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(editedMarkdown);
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(`${initialMarkdown}\n`);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(editedMarkdown);
  });

  it("tracks only multiline source edits as dirty and serializes the active link", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountProjectionEditor(`${MIXED_LINK_SOURCE} plain`, { onContentChanged });
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    expect(onContentChanged).not.toHaveBeenCalled();

    const codeEnd = getEditorTextPosition(mounted, "v2") + "v2".length;

    setTextSelection(mounted.view, codeEnd);
    typeText(mounted.view, ".1");

    expect(onContentChanged).toHaveBeenCalledTimes(2);
    expect(mounted.getMarkdown()).toBe(`${MIXED_LINK_SOURCE.replace("v2", "v2.1")} plain\n`);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(onContentChanged).toHaveBeenCalledTimes(2);
  });
});
