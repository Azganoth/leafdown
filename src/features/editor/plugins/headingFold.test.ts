// @vitest-environment happy-dom

import { redo, undo } from "@milkdown/kit/prose/history";
import { AllSelection, TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { dispatchMouseDown, dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  runKeyDownHandlers,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { EDITOR_COMMANDS } from "../commands";
import { changeSearchQuery, findNext, openSearch } from "../commands/editing/search";
import { jumpToOutlineHeading, type HeadingOutlineState } from "../utils/headingOutline";
import {
  getFoldedHeadings,
  getHeadingSection,
  isHiddenByFold,
  toggleHeadingFold,
} from "./headingFold";

const mountEditor = setupMilkdownEditorMount({ rootClassName: EDITOR_TEST_ROOT_CLASS_NAME });

const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const headingAt = (mounted: MountedMilkdownEditor, text: string) =>
  getEditorTextPosition(mounted, text) - 1;

const sectionText = (mounted: MountedMilkdownEditor, text: string) => {
  const section = getHeadingSection(mounted.view.state.doc, headingAt(mounted, text));
  return section ? mounted.view.state.doc.textBetween(section.from, section.to, "|", "|") : null;
};

const hiddenTexts = (mounted: MountedMilkdownEditor) =>
  [...mounted.view.dom.querySelectorAll(".leafdown-folded-block")].map((block) =>
    block.textContent?.trim(),
  );

const fold = (mounted: MountedMilkdownEditor, text: string) => {
  expect(toggleHeadingFold(mounted.view, headingAt(mounted, text))).toBe(true);
};

const runCommand = (mounted: MountedMilkdownEditor, commandId: "view.toggleSectionFold") =>
  EDITOR_COMMANDS[commandId].run(mounted.editor);

describe("heading section boundaries", () => {
  it("runs to the next heading of the same or higher level across skipped levels", async () => {
    const mounted = await mountEditor(
      "# Top\n\nIntro\n\n### Deep\n\nDeep body\n\n## Middle\n\nMiddle body\n\n# Next\n\nNext body",
    );

    expect(sectionText(mounted, "Top")).toBe("Intro|Deep|Deep body|Middle|Middle body");
    expect(sectionText(mounted, "Deep")).toBe("Deep body");
    expect(sectionText(mounted, "Middle")).toBe("Middle body");
    expect(sectionText(mounted, "Next")).toBe("Next body");
  });

  it("gives an adjacent heading of the same level no section", async () => {
    const mounted = await mountEditor("## First\n\n## Second\n\nBody");

    expect(sectionText(mounted, "First")).toBeNull();
    expect(mounted.view.dom.querySelector("h2[data-leafdown-fold]")?.textContent).toBe("Second");
  });

  it("keeps a heading inside a list item or quote within its container", async () => {
    const mounted = await mountEditor(
      "## Root\n\n> # Quoted\n>\n> Quoted body\n\nRoot body\n\n- ## Item\n\n  Item body\n\n- Next item\n\n## After",
    );

    expect(sectionText(mounted, "Quoted")).toBe("Quoted body");
    expect(sectionText(mounted, "Item")).toBe("Item body");
    expect(sectionText(mounted, "Root")).toBe(
      "Quoted|Quoted body|Root body||Item|Item body|Next item",
    );
  });
});

describe("heading folding", () => {
  it("hides the section without changing the Markdown, dirty state, or history", async () => {
    const markdown = "## Install\n\nStep one\n\n### Detail\n\nMore\n\n## Use\n\nRun it";
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(markdown, { onContentChanged });
    const before = mounted.getMarkdown();
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Run"));

    fold(mounted, "Install");

    expect(hiddenTexts(mounted)).toEqual(["Step one", "Detail", "More"]);
    const heading = mounted.view.dom.querySelector('h2[data-leafdown-fold="folded"]');
    expect(heading?.getAttribute("data-leafdown-fold-marker")).toBe("H2");
    expect(heading?.querySelector(".leafdown-fold-indicator")).not.toBeNull();
    expect(mounted.getMarkdown()).toBe(before);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(undo(mounted.view.state, mounted.view.dispatch)).toBe(false);
  });

  it("moves a caret the fold would hide to the end of the heading", async () => {
    const mounted = await mountEditor("## Install\n\nStep one\n\n## Use");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "one"));

    fold(mounted, "Install");

    const { selection } = mounted.view.state;
    expect(selection.empty).toBe(true);
    expect(selection.$from.parent.textContent).toBe("Install");
    expect(selection.$from.parentOffset).toBe("Install".length);
  });

  it("folds the innermost section holding the caret from the command", async () => {
    const mounted = await mountEditor("## Outer\n\nIntro\n\n### Inner\n\nInner body\n\n## Next");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "body"));

    expect(EDITOR_COMMANDS["view.toggleSectionFold"].canRun(mounted.view.state)).toBe(true);
    await runCommand(mounted, "view.toggleSectionFold");

    expect(getFoldedHeadings(mounted.view.state)).toEqual([headingAt(mounted, "Inner")]);
    expect(mounted.view.state.selection.$from.parent.textContent).toBe("Inner");

    await runCommand(mounted, "view.toggleSectionFold");

    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);
  });

  it("is unavailable outside every section", async () => {
    const mounted = await mountEditor("Preface\n\n## Only");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Preface"));

    expect(EDITOR_COMMANDS["view.toggleSectionFold"].canRun(mounted.view.state)).toBe(false);
  });

  it("toggles from a press on the heading marker and unfolds from the indicator", async () => {
    const mounted = await mountEditor("## Install\n\nStep one");
    const heading = mounted.view.dom.querySelector("h2")!;

    dispatchMouseDown(heading, { button: 0, clientX: -20 });

    expect(hiddenTexts(mounted)).toEqual(["Step one"]);

    dispatchMouseDown(heading.querySelector(".leafdown-fold-indicator")!, { button: 0 });

    expect(hiddenTexts(mounted)).toEqual([]);
  });

  it("shows the marker while the pointer is level with the heading on the surface", async () => {
    const mounted = await mountEditor("## Install\n\nStep one\n\n## Use");
    const heading = mounted.view.dom.querySelector("h2")!;
    vi.spyOn(heading, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 200, y: 100, width: 400, height: 40 }),
    );
    const marked = () => heading.hasAttribute("data-leafdown-marker-hover");

    vi.spyOn(mounted.view.dom, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width: 800, height: 600 }),
    );

    dispatchMouseEvent(document.body, "mousemove", { clientX: 900, clientY: 120 });
    await nextFrame();
    expect(marked()).toBe(false);

    dispatchMouseEvent(document.body, "mousemove", { clientX: 20, clientY: 120 });
    await vi.waitFor(() => expect(marked()).toBe(true));

    dispatchMouseEvent(heading, "mousemove", { clientX: 260, clientY: 120 });
    await nextFrame();
    expect(marked()).toBe(true);

    dispatchMouseEvent(document.body, "mousemove", { clientX: 150, clientY: 200 });
    await vi.waitFor(() => expect(marked()).toBe(false));
    expect(mounted.getMarkdown()).toBe("## Install\n\nStep one\n\n## Use\n");
  });

  it("leaves a press on the heading's text to the editor", async () => {
    const mounted = await mountEditor("## Install\n\nStep one");

    dispatchMouseDown(mounted.view.dom.querySelector("h2")!, { button: 0, clientX: 20 });

    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);
  });
});

describe("folded content", () => {
  it("opens the folds around a selection placed inside them", async () => {
    const mounted = await mountEditor("## Outer\n\n### Inner\n\nDeep\n\n## Next");
    fold(mounted, "Inner");
    fold(mounted, "Outer");

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Deep"));

    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);
  });

  it("opens the fold when Enter at the end of the heading adds a block to its section", async () => {
    const mounted = await mountEditor("## Install\n\nStep one\n\n## Use");
    fold(mounted, "Install");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Install") + "Install".length);

    expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);

    expect(mounted.view.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);
  });

  it("opens the fold when Backspace joins a block into its hidden content", async () => {
    const mounted = await mountEditor("> ## Install\n>\n> Step one\n\nAfter");
    fold(mounted, "Install");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "After"));

    expect(runKeyDownHandlers(mounted.view, "Backspace").handled).toBe(true);

    expect(mounted.view.state.selection.$from.parent.textContent).toContain("Step one");
    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);
  });

  it("keeps folds through Select all, which still covers the hidden text", async () => {
    const mounted = await mountEditor("## Install\n\nStep one\n\n## Use\n\nRun it");
    fold(mounted, "Install");

    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(new AllSelection(mounted.view.state.doc)),
    );

    expect(getFoldedHeadings(mounted.view.state)).toHaveLength(1);
    const { content } = mounted.view.state.selection.content();
    expect(content.textBetween(0, content.size, "|")).toContain("Step one");
  });

  it("keeps a fold that a selection only passes over", async () => {
    const mounted = await mountEditor("Before\n\n## Install\n\nStep one\n\n## Next\n\nAfter");
    fold(mounted, "Install");

    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "Before"),
      getEditorTextPosition(mounted, "After") + 2,
    );

    expect(getFoldedHeadings(mounted.view.state)).toHaveLength(1);
  });

  it("reveals the current search match", async () => {
    const mounted = await mountEditor("## Install\n\nneedle here\n\n## Use");
    fold(mounted, "Install");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Use"));

    openSearch(mounted.view, "find");
    changeSearchQuery(mounted.view, { query: "needle" });
    findNext(mounted.view);

    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);
  });

  it("reveals a heading chosen from the outline", async () => {
    const mounted = await mountEditor("## Install\n\n### Hidden\n\nBody\n\n## Use");
    fold(mounted, "Install");
    const hidden = headingAt(mounted, "Hidden");
    expect(isHiddenByFold(mounted.view.state, hidden)).toBe(true);

    expect(jumpToOutlineHeading(mounted.view, hidden)).toBe(true);

    expect(isHiddenByFold(mounted.view.state, hidden)).toBe(false);
    expect(mounted.view.state.selection.$from.parent.textContent).toBe("Hidden");
  });

  it("moves the outline's current heading off a heading a fold hides", async () => {
    const onHeadingOutlineChanged = vi.fn<(outline: HeadingOutlineState) => void>();
    const mounted = await mountEditor("## Install\n\n### Detail\n\nBody", {
      onHeadingOutlineChanged,
    });
    const current = () => onHeadingOutlineChanged.mock.lastCall?.[0].activePosition;
    // Without layout every heading measures at the top of the view, so the last visible one is current.
    await vi.waitFor(() => expect(current()).toBe(headingAt(mounted, "Detail")));

    fold(mounted, "Install");

    await vi.waitFor(() => expect(current()).toBe(headingAt(mounted, "Install")));
    expect(
      onHeadingOutlineChanged.mock.lastCall?.[0].headings.map((heading) => heading.folded),
    ).toEqual([true, false]);
  });

  it("keeps hidden content and the fold through edits elsewhere and undo", async () => {
    const mounted = await mountEditor("## Install\n\nStep one\n\n## Use\n\nRun it");
    fold(mounted, "Install");
    const before = mounted.getMarkdown();
    const runEnd = getEditorTextPosition(mounted, "Run it") + "Run it".length;
    const transaction = mounted.view.state.tr.insertText("!", runEnd);
    mounted.view.dispatch(transaction.setSelection(TextSelection.create(transaction.doc, 1)));

    expect(undo(mounted.view.state, mounted.view.dispatch)).toBe(true);
    expect(mounted.getMarkdown()).toBe(before);
    expect(redo(mounted.view.state, mounted.view.dispatch)).toBe(true);
    expect(mounted.getMarkdown()).toContain("Run it!");
    expect(mounted.getMarkdown()).toContain("Step one");
    expect(hiddenTexts(mounted)).toEqual(["Step one"]);
  });

  it("recomputes the section when the folded heading changes level", async () => {
    const mounted = await mountEditor(
      "## Parent\n\n### Child\n\nChild body\n\n### Sibling\n\nMore",
    );
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Child") + 1);
    fold(mounted, "Child");

    const child = headingAt(mounted, "Child");
    mounted.view.dispatch(mounted.view.state.tr.setNodeMarkup(child, undefined, { level: 2 }));

    expect(getFoldedHeadings(mounted.view.state)).toEqual([child]);
    expect(hiddenTexts(mounted)).toEqual(["Child body", "Sibling", "More"]);
  });

  it("drops a fold whose heading is removed without folding a neighbour", async () => {
    const mounted = await mountEditor("## Install\n\nStep one\n\n## Use\n\nRun it");
    fold(mounted, "Install");
    const install = headingAt(mounted, "Install");
    const node = mounted.view.state.doc.nodeAt(install)!;

    mounted.view.dispatch(mounted.view.state.tr.delete(install, install + node.nodeSize));

    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);
    expect(hiddenTexts(mounted)).toEqual([]);
  });

  it("drops a fold whose heading becomes a paragraph", async () => {
    const mounted = await mountEditor("## Install\n\nStep one");
    fold(mounted, "Install");

    mounted.view.dispatch(
      mounted.view.state.tr.setNodeMarkup(
        headingAt(mounted, "Install"),
        mounted.view.state.schema.nodes.paragraph,
      ),
    );

    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);
  });
});
