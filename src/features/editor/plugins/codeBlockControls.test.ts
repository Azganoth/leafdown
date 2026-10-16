// @vitest-environment happy-dom

import { undo } from "@milkdown/kit/prose/history";
import { describe, expect, it, vi } from "vitest";

import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import { getEditorTextPosition, setTextSelection } from "@/test/utils/prosemirror";

import { getCollapsedCodeBlocks } from "./codeBlockCollapse";
import { setCodeBlockSoftWrapEnabled } from "./codeBlockControls";
import { setCodeLineNumbersEnabled } from "./codeLineNumbers";

const mountEditor = setupMilkdownEditorMount();

const codeRows = (name: string, count: number) =>
  Array.from({ length: count }, (_, index) => `${name} ${String(index + 1).padStart(2, "0")}`).join(
    "\n",
  );

const fence = (name: string, rows: number) => `\`\`\`js\n${codeRows(name, rows)}\n\`\`\``;

const LONG_AND_SHORT = `Intro\n\n${fence("first", 12)}\n\n${fence("short", 3)}\n\n${fence("second", 10)}\n\nOutro\n`;

type Control = "expandAll" | "softWrap" | "lineNumbers";

const CONTROL_NAMES: Record<Control, string> = {
  expandAll: "Expand all code blocks",
  softWrap: "Soft wrap for code blocks",
  lineNumbers: "Display line numbers for code blocks",
};

const controlsOf = (mounted: MountedMilkdownEditor, control: Control) =>
  [...mounted.view.dom.querySelectorAll<HTMLButtonElement>("pre .leafdown-code-control")].filter(
    (button) => button.getAttribute("aria-label") === CONTROL_NAMES[control],
  );

const pressedOf = (mounted: MountedMilkdownEditor, control: Control) =>
  controlsOf(mounted, control).map((button) => button.getAttribute("aria-pressed"));

const collapseStates = (mounted: MountedMilkdownEditor) =>
  [...mounted.view.dom.querySelectorAll("pre")].map((pre) =>
    pre.getAttribute("data-leafdown-code-collapse"),
  );

const press = (button: HTMLButtonElement) => {
  const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  button.dispatchEvent(mousedown);
  button.click();
  return mousedown;
};

describe("code block controls", () => {
  it("offers each toggle on every block outside its code, naming it and its state", async () => {
    const mounted = await mountEditor(LONG_AND_SHORT, { softWrapCodeBlocks: true });

    for (const control of ["expandAll", "softWrap", "lineNumbers"] as const) {
      const buttons = controlsOf(mounted, control);

      expect(buttons).toHaveLength(3);
      for (const button of buttons) {
        expect(button).toHaveAccessibleName(CONTROL_NAMES[control]);
        expect(button.tabIndex).toBe(-1);
        expect(button.closest("[contenteditable='false']")).not.toBeNull();
        expect(button.closest("code")).toBeNull();
        expect(button.hidden).toBe(false);
      }
    }
    expect(pressedOf(mounted, "expandAll")).toEqual(["false", "false", "false"]);
    expect(pressedOf(mounted, "softWrap")).toEqual(["true", "true", "true"]);
    expect(pressedOf(mounted, "lineNumbers")).toEqual(["false", "false", "false"]);
  });

  it("hides the expand toggle while no block is long enough to collapse", async () => {
    const mounted = await mountEditor(`Intro\n\n${fence("short", 9)}\n\nOutro\n`);

    expect(controlsOf(mounted, "expandAll").map((button) => button.hidden)).toEqual([true]);

    const lastLine = getEditorTextPosition(mounted, "short 09") + "short 09".length;
    mounted.view.dispatch(mounted.view.state.tr.insertText("\nshort 10", lastLine));

    expect(controlsOf(mounted, "expandAll").map((button) => button.hidden)).toEqual([false]);
  });

  it("expands and collapses every long block from any block without touching the document", async () => {
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(LONG_AND_SHORT, { onContentChanged });
    const before = mounted.getMarkdown();
    const caret = getEditorTextPosition(mounted, "Outro");
    setTextSelection(mounted.view, caret);

    expect(collapseStates(mounted)).toEqual(["collapsed", null, "collapsed"]);
    expect(press(controlsOf(mounted, "expandAll")[1]).defaultPrevented).toBe(true);

    expect(collapseStates(mounted)).toEqual(["expanded", null, "expanded"]);
    expect(pressedOf(mounted, "expandAll")).toEqual(["true", "true", "true"]);

    press(controlsOf(mounted, "expandAll")[0]);

    expect(collapseStates(mounted)).toEqual(["collapsed", null, "collapsed"]);
    expect(pressedOf(mounted, "expandAll")).toEqual(["false", "false", "false"]);
    expect(mounted.view.state.selection.from).toBe(caret);
    expect(mounted.getMarkdown()).toBe(before);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(undo(mounted.view.state, mounted.view.dispatch)).toBe(false);
  });

  it("expands the rest when some blocks are already expanded, and collapses only once all are", async () => {
    const mounted = await mountEditor(LONG_AND_SHORT);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "first 11"));

    expect(collapseStates(mounted)).toEqual(["expanded", null, "collapsed"]);
    expect(pressedOf(mounted, "expandAll")).toEqual(["false", "false", "false"]);

    press(controlsOf(mounted, "expandAll")[2]);

    expect(collapseStates(mounted)).toEqual(["expanded", null, "expanded"]);
  });

  it("moves a caret that collapsing every block would hide to the end of its last shown line", async () => {
    const mounted = await mountEditor(LONG_AND_SHORT);
    press(controlsOf(mounted, "expandAll")[0]);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "second 10") + 2);

    press(controlsOf(mounted, "expandAll")[0]);

    expect(getCollapsedCodeBlocks(mounted.view.state)).toHaveLength(2);
    expect(mounted.view.state.selection.empty).toBe(true);
    expect(mounted.view.state.selection.from).toBe(
      getEditorTextPosition(mounted, "second 08") + "second 08".length,
    );
  });

  it("asks to change soft wrap and line numbers, and every block follows the settings", async () => {
    const onCodeBlockSettingChange = vi.fn();
    const onContentChanged = vi.fn();
    const mounted = await mountEditor(LONG_AND_SHORT, {
      onCodeBlockSettingChange,
      onContentChanged,
    });
    const before = mounted.getMarkdown();
    const caret = getEditorTextPosition(mounted, "Intro") + 2;
    setTextSelection(mounted.view, caret);

    expect(press(controlsOf(mounted, "softWrap")[2]).defaultPrevented).toBe(true);
    press(controlsOf(mounted, "lineNumbers")[0]);

    expect(onCodeBlockSettingChange.mock.calls).toEqual([
      ["softWrapCodeBlocks", true],
      ["displayCodeBlockLineNumbers", true],
    ]);

    setCodeBlockSoftWrapEnabled(mounted.view, true);
    setCodeLineNumbersEnabled(mounted.view, true);

    expect(pressedOf(mounted, "softWrap")).toEqual(["true", "true", "true"]);
    expect(pressedOf(mounted, "lineNumbers")).toEqual(["true", "true", "true"]);

    press(controlsOf(mounted, "softWrap")[1]);

    expect(onCodeBlockSettingChange).toHaveBeenLastCalledWith("softWrapCodeBlocks", false);
    expect(mounted.view.state.selection.from).toBe(caret);
    expect(mounted.getMarkdown()).toBe(before);
    expect(onContentChanged).not.toHaveBeenCalled();
    expect(undo(mounted.view.state, mounted.view.dispatch)).toBe(false);
  });

  it("stays out of the saved Markdown and the copied HTML", async () => {
    const mounted = await mountEditor(LONG_AND_SHORT);

    setTextSelection(mounted.view, 1, mounted.view.state.doc.content.size - 1);
    const copied = mounted.view.serializeForClipboard(mounted.view.state.selection.content());

    expect(mounted.getMarkdown()).toBe(LONG_AND_SHORT);
    expect(copied.dom.querySelector(".leafdown-code-control, svg")).toBeNull();
    expect(copied.dom.querySelectorAll("pre")[1]?.textContent).toBe(codeRows("short", 3));
  });
});
