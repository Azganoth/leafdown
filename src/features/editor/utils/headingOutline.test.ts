// @vitest-environment happy-dom

import { closeHistory, history, redo, undo } from "@milkdown/kit/prose/history";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState } from "@milkdown/kit/prose/state";
import { describe, expect, it, onTestFinished, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";

import {
  findLastHeadingAtOrAbove,
  getActiveLine,
  getOutlineHeadings,
  getShownHeadingPosition,
  getVisibleOutlineHeadings,
  jumpToOutlineHeading,
  type OutlineHeading,
} from "./headingOutline";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    paragraph: { content: "inline*", group: "block" },
    heading: { content: "inline*", group: "block", attrs: { level: { default: 1 } } },
    blockquote: { content: "block+", group: "block" },
    bullet_list: { content: "list_item+", group: "block" },
    list_item: { content: "block+" },
  },
});

const heading = (level: number, text: string) =>
  schema.nodes.heading.create({ level }, schema.text(text));

const outlineHeading = (position: number, level: number): OutlineHeading => ({
  position,
  level,
  text: `H${level} at ${position}`,
  context: [],
  folded: false,
});

describe("heading outline", () => {
  it("keeps duplicate headings distinct and includes skipped levels and container context", () => {
    const headings = getOutlineHeadings(
      schema.nodes.doc.create(null, [
        heading(1, "Same"),
        schema.nodes.blockquote.create(null, heading(3, "Quoted")),
        schema.nodes.bullet_list.create(
          null,
          schema.nodes.list_item.create(null, heading(2, "Nested")),
        ),
        heading(1, "Same"),
      ]),
    );

    expect(headings.map(({ text, level, context }) => ({ text, level, context }))).toEqual([
      { text: "Same", level: 1, context: [] },
      { text: "Quoted", level: 3, context: ["blockquote"] },
      { text: "Nested", level: 2, context: ["bullet_list"] },
      { text: "Same", level: 1, context: [] },
    ]);
    expect(new Set(headings.map((item) => item.position)).size).toBe(4);
  });

  it("recomputes labels, levels, and positions after edits and undo/redo", () => {
    let state = EditorState.create({
      schema,
      doc: schema.nodes.doc.create(null, [heading(1, "First"), heading(2, "Second")]),
      plugins: [history()],
    });
    const first = getOutlineHeadings(state.doc)[0];
    state = state.apply(state.tr.insertText("New ", first.position + 1));
    expect(getOutlineHeadings(state.doc)[0].text).toBe("New First");

    const second = getOutlineHeadings(state.doc)[1];
    state = state.apply(
      closeHistory(state.tr).setNodeMarkup(second.position, undefined, { level: 4 }),
    );
    expect(getOutlineHeadings(state.doc)[1]).toMatchObject({ level: 4, position: second.position });

    expect(undo(state, (transaction) => (state = state.apply(transaction)))).toBe(true);
    expect(getOutlineHeadings(state.doc)[1].level).toBe(2);
    expect(redo(state, (transaction) => (state = state.apply(transaction)))).toBe(true);
    expect(getOutlineHeadings(state.doc)[1].level).toBe(4);
  });

  it("lists headings down to the chosen depth, or the shallowest level when none reach it", () => {
    const headings = [outlineHeading(0, 1), outlineHeading(10, 3), outlineHeading(20, 4)];

    expect(getVisibleOutlineHeadings(headings, 3).map((item) => item.position)).toEqual([0, 10]);
    expect(getVisibleOutlineHeadings(headings, 1).map((item) => item.position)).toEqual([0]);

    const deep = [outlineHeading(0, 4), outlineHeading(10, 5), outlineHeading(20, 4)];
    expect(getVisibleOutlineHeadings(deep, 2).map((item) => item.position)).toEqual([0, 20]);
    expect(getVisibleOutlineHeadings([], 3)).toEqual([]);
  });

  it("marks the nearest shown heading at or before the current one", () => {
    const visible = [outlineHeading(0, 1), outlineHeading(10, 2)];

    expect(getShownHeadingPosition(visible, 10)).toBe(10);
    expect(getShownHeadingPosition(visible, 15)).toBe(10);
    expect(getShownHeadingPosition(visible, 5)).toBe(0);
    expect(getShownHeadingPosition([outlineHeading(10, 2)], 5)).toBeNull();
    expect(getShownHeadingPosition(visible, null)).toBeNull();
  });

  it("finds the last heading that has reached the active line", () => {
    const tops = [100, 300, 500];
    const topAt = (index: number) => tops[index];

    expect(findLastHeadingAtOrAbove(tops.length, topAt, 50)).toBe(-1);
    expect(findLastHeadingAtOrAbove(tops.length, topAt, 100)).toBe(0);
    expect(findLastHeadingAtOrAbove(tops.length, topAt, 499)).toBe(1);
    expect(findLastHeadingAtOrAbove(tops.length, topAt, 900)).toBe(2);
    expect(findLastHeadingAtOrAbove(0, topAt, 900)).toBe(-1);
  });

  it("moves the active line to the bottom of the view over the last stretch of scrolling", () => {
    expect(getActiveLine(100, 600, 2000, 3000)).toBe(180);
    expect(getActiveLine(100, 600, 0, 3000)).toBe(700);
    expect(getActiveLine(100, 600, 260, 3000)).toBe(440);
    expect(getActiveLine(100, 600, 0, 0)).toBe(180);
    expect(getActiveLine(100, 600, 0, 50)).toBe(700);
  });
});

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const VIEWPORT_TOP = 50;
const DOCUMENT_TOP = 40;

// Lays the document out in a scrolling viewport: each listed heading sits at its offset below the
// document's first line, which rests DOCUMENT_TOP below the viewport's top before any scrolling.
const mountScrolledEditor = async (markdown: string, offsets: Record<string, number>) => {
  const mounted = await mountEditor(markdown);
  const viewport = document.createElement("div");
  viewport.style.overflowY = "auto";
  mounted.root.before(viewport);
  viewport.append(mounted.root);
  onTestFinished(() => viewport.remove());

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const offset = this === viewport ? -DOCUMENT_TOP : (offsets[this.textContent ?? ""] ?? 0);
    const top =
      this === viewport ? VIEWPORT_TOP : VIEWPORT_TOP + DOCUMENT_TOP + offset - viewport.scrollTop;
    return DOMRect.fromRect({ x: 0, y: top, width: 600, height: 24 });
  });
  return { mounted, viewport };
};

const headingPosition = (mounted: MountedMilkdownEditor, text: string) =>
  getOutlineHeadings(mounted.view.state.doc).find((outline) => outline.text === text)!.position;

const headingClearance = (mounted: MountedMilkdownEditor, text: string) =>
  (mounted.view.nodeDOM(headingPosition(mounted, text)) as Element).getBoundingClientRect().top -
  VIEWPORT_TOP;

describe("outline navigation", () => {
  it("brings headings to where the document's first line rests and returns to the start", async () => {
    const markdown =
      "# Opening\n\nIntro\n\n## Middle\n\nBody\n\n> ### Quoted\n\n- ## Listed\n\n# Final";
    const { mounted, viewport } = await mountScrolledEditor(markdown, {
      Middle: 400,
      Quoted: 700,
      Listed: 900,
      Final: 1200,
    });
    const before = mounted.getMarkdown();
    viewport.scrollTop = 1500;

    for (const [text, scrollTop] of [
      ["Middle", 400],
      ["Quoted", 700],
      ["Listed", 900],
      ["Final", 1200],
      ["Opening", 0],
    ] as const) {
      expect(jumpToOutlineHeading(mounted.view, headingPosition(mounted, text))).toBe(true);
      expect(viewport.scrollTop).toBe(scrollTop);
      expect(headingClearance(mounted, text)).toBe(DOCUMENT_TOP);
      expect(mounted.view.state.selection.from).toBe(headingPosition(mounted, text) + 1);
    }
    expect(mounted.getMarkdown()).toBe(before);
  });

  it("returns to the start for a heading that opens the document inside a container", async () => {
    const { mounted, viewport } = await mountScrolledEditor("> ## Quoted\n\nBody\n\n## Later", {
      Quoted: 6,
      Later: 300,
    });
    viewport.scrollTop = 500;

    expect(jumpToOutlineHeading(mounted.view, headingPosition(mounted, "Quoted"))).toBe(true);

    expect(viewport.scrollTop).toBe(0);
  });

  it("navigates to a first heading that follows introductory content", async () => {
    const { mounted, viewport } = await mountScrolledEditor("Intro\n\n# First\n\nBody", {
      First: 120,
    });
    viewport.scrollTop = 500;

    expect(jumpToOutlineHeading(mounted.view, headingPosition(mounted, "First"))).toBe(true);

    expect(viewport.scrollTop).toBe(120);
    expect(headingClearance(mounted, "First")).toBe(DOCUMENT_TOP);
  });
});
