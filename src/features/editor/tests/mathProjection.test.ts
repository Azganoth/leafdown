// @vitest-environment happy-dom

import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it, vi } from "vitest";

import { dispatchMouseEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount } from "@/test/utils/milkdown";
import {
  getEditorNodePosition,
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { runEditorCommand } from "../commands";
import { finalizeSourceProjection, hasActiveSourceProjection } from "../plugins/sourceProjection";

const mountEditor = setupMilkdownEditorMount();
const markdown = "Before $x^2$ after\n\nEnd\n";
const isDisplay = (node: ProseMirrorNode) => (node.attrs.value as string).startsWith("$$");
const isInline = (node: ProseMirrorNode) => !isDisplay(node);

describe("math source projection", () => {
  it.each(["left", "right", "node"] as const)(
    "enters from %s and restores untouched source",
    async (side) => {
      const mounted = await mountEditor(markdown);
      const position = getEditorNodePosition(mounted, "math_inline");
      if (side === "node") {
        mounted.view.dispatch(
          mounted.view.state.tr.setSelection(
            NodeSelection.create(mounted.view.state.doc, position),
          ),
        );
      } else {
        setTextSelection(mounted.view, position + (side === "right" ? 1 : 0));
      }
      expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
      expect(getEditorTextContent(mounted)).toContain("$x^2$");
      expect(getSelectedEditorText(mounted)).toBe(side === "node" ? "$x^2$" : "");
      expect(mounted.view.state.selection.from).toBe(
        position + (side === "right" ? "$x^2$".length : 0),
      );
      setSelectionAtDocumentEnd(mounted.view);
      expect(mounted.getMarkdown()).toBe(markdown);
    },
  );

  it("places a click just inside the opening delimiter", async () => {
    const mounted = await mountEditor(markdown);
    const position = getEditorNodePosition(mounted, "math_inline");
    const math = mounted.view.dom.querySelector<HTMLElement>('[data-type="math"]')!;
    dispatchMouseEvent(math, "mousedown", { button: 0 });
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.view.state.selection.from).toBe(position + 1);
  });

  it("commits edited source and supports Undo and Redo", async () => {
    const mounted = await mountEditor(markdown);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline") + 1);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "^2") + 2);
    typeText(mounted.view, "+1");
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(getEditorTextContent(mounted)).toContain("$x^2+$");
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    finalizeSourceProjection(mounted.view);
    expect(mounted.getMarkdown()).toBe(markdown.replace("$x^2$", "$x^2+1$"));
    expect(mounted.view.dom.querySelector('[data-type="math"]')).toHaveAttribute(
      "data-value",
      "$x^2+1$",
    );
    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(markdown);
    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe(markdown.replace("$x^2$", "$x^2+1$"));
  });

  it("commits a broken delimiter as literal text", async () => {
    const mounted = await mountEditor(markdown);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline") + 1);
    const end = getEditorTextPosition(mounted, "$x^2$") + "$x^2$".length;
    setTextSelection(mounted.view, end - 1, end);
    typeText(mounted.view, " ");
    finalizeSourceProjection(mounted.view);
    expect(mounted.view.dom.querySelector('[data-type="math"]')).toBeNull();
    expect(mounted.view.state.doc.textContent).toContain("$x^2");
    expect(mounted.getMarkdown()).toBe(markdown.replace("$x^2$", "$x^2 "));
  });

  it("inserts a line ending with Enter", async () => {
    const mounted = await mountEditor(markdown);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline") + 1);
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "^2") + 2);
    expect(runKeyDownHandlers(mounted.view, "Enter").handled).toBe(true);
    expect(getEditorTextContent(mounted)).toContain("$x^2\n$");
  });

  it("previews the rendered source beside inline source as it is edited", async () => {
    const mounted = await mountEditor(markdown);
    vi.spyOn(performance, "now").mockReturnValue(0);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline") + 1);
    const getPreview = () => mounted.view.dom.querySelector<HTMLElement>(".leafdown-math-preview")!;

    expect(getPreview()).not.toHaveClass("leafdown-math-preview--block");
    expect(getPreview().querySelector("annotation")).toHaveTextContent("x^2");
    setTextSelection(mounted.view, getEditorTextPosition(mounted, "^2") + 2);
    typeText(mounted.view, "+1");
    expect(getPreview().querySelector("annotation")).toHaveTextContent("x^2+1");
    expect(getEditorTextContent(mounted)).not.toContain("x^2+1x");

    typeText(mounted.view, "\\frac");
    expect(getPreview()).toHaveAttribute("data-math-rendered", "false");
    expect(getPreview()).toHaveTextContent(/^Math error: /u);
    expect(getPreview().querySelector(".katex")).toBeNull();

    setSelectionAtDocumentEnd(mounted.view);
    expect(mounted.view.dom.querySelector(".leafdown-math-preview")).toBeNull();
    expect(mounted.getMarkdown()).toBe(markdown.replace("$x^2$", "$x^2+1\\frac$"));
  });

  it("previews display source below it and a table cell's TeX after its pipe escapes", async () => {
    const mounted = await mountEditor("$$\nx\n$$\n\n| a |\n| - |\n| $x\\|y$ |\n\nEnd\n");
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline", isDisplay));
    const preview = mounted.view.dom.querySelector(".leafdown-math-preview");

    expect(preview).toHaveClass("leafdown-math-preview--block");
    expect(preview?.querySelector(".katex-display")).not.toBeNull();

    setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline", isInline));
    expect(mounted.view.dom.querySelector(".leafdown-math-preview annotation")).toHaveTextContent(
      "x|y",
    );
  });

  it("holds a costly preview until typing pauses", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const mounted = await mountEditor(markdown);
      let now = 0;
      vi.spyOn(performance, "now").mockImplementation(() => (now += 20));
      setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline") + 1);
      setTextSelection(mounted.view, getEditorTextPosition(mounted, "^2") + 2);
      const getTex = () =>
        mounted.view.dom.querySelector(".leafdown-math-preview annotation")?.textContent;

      typeText(mounted.view, "+1");
      expect(getTex()).toBe("x^2");
      vi.advanceTimersByTime(299);
      expect(getTex()).toBe("x^2");
      vi.advanceTimersByTime(1);
      expect(getTex()).toBe("x^2+1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps indented display lines when edited and saved again", async () => {
    const source = "$$\n  a\n    b\n$$\n";
    const mounted = await mountEditor(source);
    setTextSelection(mounted.view, getEditorNodePosition(mounted, "math_inline"));
    const position = getEditorTextPosition(mounted, "a\n");
    setTextSelection(mounted.view, position, position + 1);
    typeText(mounted.view, "c");
    expect(mounted.getMarkdown()).toBe(source.replace("  a\n", "  c\n"));
    const reopened = await mountEditor(mounted.getMarkdown());
    expect(reopened.getMarkdown()).toBe(mounted.getMarkdown());
  });
});
