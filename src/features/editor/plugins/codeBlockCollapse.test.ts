// @vitest-environment happy-dom

import { undo } from "@milkdown/kit/prose/history";
import { AllSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextPosition,
  runKeyDownHandlers,
  setTextSelection,
} from "@/test/utils/prosemirror";

import { EDITOR_COMMANDS } from "../commands";
import { changeSearchQuery, findNext, openSearch } from "../commands/editing/search";
import { getEditorDocumentStatus } from "../utils/documentStatus";
import { getCollapsedCodeBlocks } from "./codeBlockCollapse";
import { getFoldedHeadings } from "./headingFold";

const mountEditor = setupMilkdownEditorMount();

const codeRows = (count: number) =>
  Array.from({ length: count }, (_, index) => `row ${String(index + 1).padStart(2, "0")}`).join(
    "\n",
  );

const withCode = (rows: number) => `Intro\n\n\`\`\`js\n${codeRows(rows)}\n\`\`\`\n\nOutro\n`;

const preOf = (mounted: MountedMilkdownEditor) => mounted.view.dom.querySelector("pre")!;

const expandButtonOf = (mounted: MountedMilkdownEditor) =>
  preOf(mounted).querySelector<HTMLButtonElement>(".leafdown-code-expand")!;

const collapseButtonOf = (mounted: MountedMilkdownEditor) =>
  preOf(mounted).querySelector<HTMLButtonElement>(".leafdown-code-collapse")!;

const hiddenText = (mounted: MountedMilkdownEditor) =>
  [...preOf(mounted).querySelectorAll(".leafdown-code-collapsed-lines")]
    .map((element) => element.textContent)
    .join("");

const collapseOf = (mounted: MountedMilkdownEditor) =>
  preOf(mounted).getAttribute("data-leafdown-code-collapse");

const rowPosition = (mounted: MountedMilkdownEditor, row: number, offset = 0) =>
  getEditorTextPosition(mounted, `row ${String(row).padStart(2, "0")}`) + offset;

const press = (button: HTMLButtonElement) => {
  const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  button.dispatchEvent(mousedown);
  button.click();
  return mousedown;
};

describe("code block collapse", () => {
  it("opens a long block collapsed, hiding the lines after the eighth", async () => {
    const mounted = await mountEditor(withCode(12));

    expect(collapseOf(mounted)).toBe("collapsed");
    expect(hiddenText(mounted)).toBe("\nrow 09\nrow 10\nrow 11\nrow 12");
    expect(expandButtonOf(mounted).hidden).toBe(false);
    expect(expandButtonOf(mounted)).toHaveTextContent("Show 4 more lines");
    expect(expandButtonOf(mounted)).toHaveAttribute("aria-expanded", "false");
    expect(expandButtonOf(mounted).tabIndex).toBe(-1);
    expect(collapseButtonOf(mounted).hidden).toBe(true);
    expect(preOf(mounted).querySelector("code")).toHaveTextContent("row 12");
  });

  it("collapses a block only when it would hide at least two lines", async () => {
    const short = await mountEditor(withCode(9));

    expect(collapseOf(short)).toBeNull();
    expect(hiddenText(short)).toBe("");
    expect(expandButtonOf(short).hidden).toBe(true);
    expect(collapseButtonOf(short).hidden).toBe(true);

    const long = await mountEditor(withCode(10));

    expect(collapseOf(long)).toBe("collapsed");
    expect(expandButtonOf(long)).toHaveTextContent("Show 2 more lines");
  });

  it("expands and collapses by pointer without touching the selection, document, or history", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(withCode(12), { onContentChanged });
    const before = mounted.getMarkdown();
    const caret = getEditorTextPosition(mounted, "Outro");
    setTextSelection(mounted.view, caret);

    expect(press(expandButtonOf(mounted)).defaultPrevented).toBe(true);

    expect(collapseOf(mounted)).toBe("expanded");
    expect(hiddenText(mounted)).toBe("");
    expect(expandButtonOf(mounted).hidden).toBe(true);
    expect(collapseButtonOf(mounted).hidden).toBe(false);
    expect(collapseButtonOf(mounted)).toHaveAccessibleName("Collapse code block");
    expect(collapseButtonOf(mounted)).toHaveAttribute("aria-expanded", "true");

    expect(press(collapseButtonOf(mounted)).defaultPrevented).toBe(true);

    expect(collapseOf(mounted)).toBe("collapsed");
    expect(mounted.view.state.selection.from).toBe(caret);
    expect(mounted.getMarkdown()).toBe(before);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(undo(mounted.view.state, mounted.view.dispatch)).toBe(false);
  });

  it("stays collapsed for a caret on a shown line and expands when one reaches a hidden line", async () => {
    const mounted = await mountEditor(withCode(12));

    setTextSelection(mounted.view, rowPosition(mounted, 3));
    setTextSelection(mounted.view, rowPosition(mounted, 8, "row 08".length));

    expect(collapseOf(mounted)).toBe("collapsed");

    setTextSelection(mounted.view, rowPosition(mounted, 10, 2));

    expect(collapseOf(mounted)).toBe("expanded");
  });

  it("stays collapsed under a selection that only passes over it", async () => {
    const mounted = await mountEditor(withCode(12));

    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "Intro"),
      getEditorTextPosition(mounted, "Outro"),
    );
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(new AllSelection(mounted.view.state.doc)),
    );

    expect(collapseOf(mounted)).toBe("collapsed");
  });

  it("expands before an arrow key steps past the last shown line", async () => {
    const mounted = await mountEditor(withCode(12));

    setTextSelection(mounted.view, rowPosition(mounted, 7, 2));
    runKeyDownHandlers(mounted.view, "ArrowDown");
    setTextSelection(mounted.view, rowPosition(mounted, 8, 2));
    runKeyDownHandlers(mounted.view, "ArrowRight");
    runKeyDownHandlers(mounted.view, "ArrowDown", { shiftKey: true });

    expect(collapseOf(mounted)).toBe("collapsed");

    expect(runKeyDownHandlers(mounted.view, "ArrowDown").handled).toBe(true);

    expect(collapseOf(mounted)).toBe("expanded");
    expect(mounted.view.state.selection.from).toBe(rowPosition(mounted, 9, 2));

    const reopened = await mountEditor(withCode(12));
    setTextSelection(reopened.view, rowPosition(reopened, 8, "row 08".length));

    expect(runKeyDownHandlers(reopened.view, "ArrowRight").handled).toBe(true);

    expect(collapseOf(reopened)).toBe("expanded");
    expect(reopened.view.state.selection.from).toBe(rowPosition(reopened, 9));
  });

  it("leaves `Down` to the browser on a wrapped row above the last shown row", async () => {
    const mounted = await mountEditor(withCode(12));
    const lastRowEnd = rowPosition(mounted, 8, "row 08".length);
    vi.spyOn(mounted.view, "coordsAtPos").mockImplementation((position) => {
      const bottom = position === lastRowEnd ? 40 : 20;
      return { left: 0, right: 0, top: bottom - 10, bottom };
    });
    setTextSelection(mounted.view, rowPosition(mounted, 8, 2));

    expect(runKeyDownHandlers(mounted.view, "ArrowDown").handled).toBe(false);

    expect(collapseOf(mounted)).toBe("collapsed");
  });

  it("expands for the current find match on a hidden line", async () => {
    const mounted = await mountEditor(withCode(12));
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Intro"));

    openSearch(mounted.view, "find");
    changeSearchQuery(mounted.view, { query: "row 11" });
    findNext(mounted.view);

    expect(collapseOf(mounted)).toBe("expanded");
  });

  it("moves a caret the collapse would hide to the end of the last shown line", async () => {
    const mounted = await mountEditor(withCode(12));
    setTextSelection(mounted.view, rowPosition(mounted, 11, 2));

    press(collapseButtonOf(mounted));

    expect(collapseOf(mounted)).toBe("collapsed");
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.from).toBe(rowPosition(mounted, 8, "row 08".length));
  });

  it("toggles the block at the caret from `Fold or unfold section` before its section", async () => {
    const mounted = await mountEditor(`## Code\n\n${withCode(12)}`);
    const command = EDITOR_COMMANDS["view.toggleSectionFold"];
    setTextSelection(mounted.view, rowPosition(mounted, 2));

    expect(command.canRun(mounted.view.state)).toBe(true);
    await command.run(mounted.editor);

    expect(collapseOf(mounted)).toBe("expanded");

    await command.run(mounted.editor);

    expect(collapseOf(mounted)).toBe("collapsed");
    expect(getFoldedHeadings(mounted.view.state)).toEqual([]);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "Outro"));
    await command.run(mounted.editor);

    expect(getFoldedHeadings(mounted.view.state)).toHaveLength(1);
  });

  it("keeps hidden lines in the saved Markdown, copied content, and counts", async () => {
    const mounted = await mountEditor(withCode(12));
    const expanded = await mountEditor(withCode(12));
    press(expandButtonOf(expanded));

    expect(mounted.getMarkdown()).toContain("row 12\n```");
    expect(getEditorDocumentStatus(mounted.view.state)).toEqual(
      getEditorDocumentStatus(expanded.view.state),
    );
    expect(getEditorDocumentStatus(mounted.view.state).document.words).toBe(26);

    setTextSelection(
      mounted.view,
      getEditorTextPosition(mounted, "Intro"),
      getEditorTextPosition(mounted, "Outro") + "Outro".length,
    );
    const copied = mounted.view.serializeForClipboard(mounted.view.state.selection.content());

    expect(copied.text).toContain("row 09\nrow 10\nrow 11\nrow 12");
    expect(collapseOf(mounted)).toBe("collapsed");
  });

  it("follows edits to the block and the document around it", async () => {
    const mounted = await mountEditor(withCode(12));
    const { view } = mounted;

    view.dispatch(view.state.tr.insertText("Lead ", getEditorTextPosition(mounted, "Intro")));
    view.dispatch(view.state.tr.insertText("\nrow 13", rowPosition(mounted, 12, "row 12".length)));

    expect(collapseOf(mounted)).toBe("collapsed");
    expect(expandButtonOf(mounted)).toHaveTextContent("Show 5 more lines");
    expect(hiddenText(mounted)).toBe("\nrow 09\nrow 10\nrow 11\nrow 12\nrow 13");

    view.dispatch(view.state.tr.delete(rowPosition(mounted, 9) - 1, rowPosition(mounted, 13) - 1));

    expect(view.state.doc.textBetween(0, view.state.doc.content.size, "|")).toContain(
      "row 08\nrow 13",
    );
    expect(collapseOf(mounted)).toBeNull();
    expect(getCollapsedCodeBlocks(view.state)).toEqual([]);
  });
});
