import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveSourceProjection } from "./sourceProjection";

const mountEditor = setupMilkdownEditorMount();
const PLAIN_LINK_SOURCE = "[first field\nwalk](./nested-directory/doc-alternate.markdown)";
const MIXED_LINK_SOURCE =
  '[**calibration summary** with *field observations*, ~~retired wording~~,\nand `v2`](./article-navigator/01-overview.md "Calibration review")';

const mountProjectionEditor = (source: string) =>
  mountEditor(source, { rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const getInlineBreakPosition = (document: ProseMirrorNode) => {
  let position: number | null = null;

  document.descendants((node, nodePosition) => {
    if (node.type.name !== "hardbreak" || node.attrs.isInline !== true) {
      return true;
    }

    position = nodePosition;
    return false;
  });

  if (position === null) {
    throw new Error("Expected an inline soft-break node.");
  }

  return position;
};

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
  });

  it("projects a mixed-format multiline label as one source object", async () => {
    const mounted = await mountProjectionEditor(MIXED_LINK_SOURCE);
    const breakPosition = getInlineBreakPosition(mounted.view.state.doc);

    setTextSelection(mounted.view, breakPosition);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(getEditorTextContent(mounted)).toBe(MIXED_LINK_SOURCE);
    expect(mounted.view.dom.querySelector("a, strong, em, del, code")).not.toBeInTheDocument();
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
        }),
      ]),
    );
    expect(getEditorNodePosition(mounted, "hardbreak")).toBeGreaterThan(0);
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
});
