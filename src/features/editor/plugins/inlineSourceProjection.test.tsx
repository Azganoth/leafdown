import { afterEach, describe, expect, it, vi } from "vitest";

import { runEditorCommand } from "@/features/editor/utils/editorCommands";
import { mountMilkdownEditor, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  pressKey,
  setSelectionAtDocumentEnd,
  setSelectionAtTextEnd,
  setTextSelection,
  typeText,
} from "@/test/utils/prosemirror";

import { hasActiveInlineSourceProjection } from "./inlineSourceProjection";

const mountedEditors: MountedMilkdownEditor[] = [];

const mountEditor = async (
  initialMarkdown: string,
  onContentTransaction = vi.fn(),
): Promise<MountedMilkdownEditor> => {
  const mounted = await mountMilkdownEditor(initialMarkdown, {
    onContentTransaction,
    rootClassName: "leafdown-editor",
  });
  mountedEditors.push(mounted);
  return mounted;
};

const enterProjection = (mounted: MountedMilkdownEditor, selector: "em" | "strong") => {
  const element = mounted.view.dom.querySelector(selector);

  expect(element).toBeInTheDocument();

  setSelectionAtTextEnd(mounted.view, element as HTMLElement);

  expect(hasActiveInlineSourceProjection(mounted.view.state)).toBe(true);
};

const getTextPosition = (mounted: MountedMilkdownEditor, text: string) => {
  let position: number | null = null;

  mounted.view.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return true;
    }

    const index = node.textContent.indexOf(text);

    if (index === -1) {
      return true;
    }

    position = pos + index;
    return false;
  });

  if (position === null) {
    throw new Error(`Could not find projected text: ${text}`);
  }

  return position;
};

const runCommand = async (mounted: MountedMilkdownEditor, commandId: "edit.redo" | "edit.undo") =>
  Promise.resolve(runEditorCommand(mounted.editor, commandId));

describe("inline source projection", () => {
  afterEach(async () => {
    await Promise.all(mountedEditors.splice(0).map((mounted) => mounted.destroy()));
  });

  it("projects strong markers as real editable document text", async () => {
    const mounted = await mountEditor("**Bold** plain");

    enterProjection(mounted, "strong");

    expect(mounted.view.state.doc.textContent).toBe("**Bold** plain");
    expect(
      mounted.view.dom.querySelector(".leafdown-source-edit[aria-label='Inline Markdown']"),
    ).not.toBeInTheDocument();

    const sourceStart = getTextPosition(mounted, "**Bold**");

    setTextSelection(mounted.view, sourceStart);
    expect(hasActiveInlineSourceProjection(mounted.view.state)).toBe(true);

    setTextSelection(mounted.view, sourceStart + 1);
    expect(hasActiveInlineSourceProjection(mounted.view.state)).toBe(true);

    setTextSelection(mounted.view, sourceStart + "**Bold".length);
    expect(hasActiveInlineSourceProjection(mounted.view.state)).toBe(true);
  });

  it.each([
    {
      expected: "**Bolder** plain\n",
      initial: "**Bold** plain",
      selector: "strong" as const,
    },
    {
      expected: "__Bolder__ plain\n",
      initial: "__Bold__ plain",
      selector: "strong" as const,
    },
    {
      expected: "*Softer* plain\n",
      initial: "*Soft* plain",
      selector: "em" as const,
    },
    {
      expected: "_Softer_ plain\n",
      initial: "_Soft_ plain",
      selector: "em" as const,
    },
  ])("commits valid projected source for $initial", async ({ expected, initial, selector }) => {
    const mounted = await mountEditor(initial);

    enterProjection(mounted, selector);
    typeText(mounted.view, "er");
    setSelectionAtDocumentEnd(mounted.view);

    expect(hasActiveInlineSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.getMarkdown()).toBe(expected);
  });

  it("commits partially deleted markers as literal fallback text", async () => {
    const mounted = await mountEditor("**Bold** plain");

    enterProjection(mounted, "strong");

    const sourceStart = getTextPosition(mounted, "**Bold**");

    setTextSelection(mounted.view, sourceStart + 1);
    pressKey(mounted.view, "Backspace");
    setSelectionAtDocumentEnd(mounted.view);

    expect(hasActiveInlineSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.view.state.doc.textContent).toBe("*Bold** plain");
    expect(mounted.getMarkdown()).toBe("\\*Bold\\*\\* plain\n");
  });

  it("tracks real source edits as dirty without counting projection entry or commit", async () => {
    const onContentTransaction = vi.fn();
    const mounted = await mountEditor("**Bold** plain", onContentTransaction);

    enterProjection(mounted, "strong");

    expect(onContentTransaction).not.toHaveBeenCalled();

    typeText(mounted.view, "er");

    expect(onContentTransaction).toHaveBeenCalledTimes(2);

    setSelectionAtDocumentEnd(mounted.view);

    expect(onContentTransaction).toHaveBeenCalledTimes(2);
  });

  it("finalizes active projected source before Markdown serialization", async () => {
    const mounted = await mountEditor("**Bold** plain");

    enterProjection(mounted, "strong");
    typeText(mounted.view, "er");

    expect(hasActiveInlineSourceProjection(mounted.view.state)).toBe(true);
    expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
    expect(hasActiveInlineSourceProjection(mounted.view.state)).toBe(false);
  });

  it("uses projection-local undo and redo while projection is active", async () => {
    const mounted = await mountEditor("**Bold** plain");

    enterProjection(mounted, "strong");
    typeText(mounted.view, "er");

    expect(mounted.view.state.doc.textContent).toBe("**Bolder** plain");
    expect(await runCommand(mounted, "edit.undo")).toBe(true);
    expect(mounted.view.state.doc.textContent).toBe("**Bolde** plain");
    expect(await runCommand(mounted, "edit.undo")).toBe(true);
    expect(mounted.view.state.doc.textContent).toBe("**Bold** plain");
    expect(await runCommand(mounted, "edit.redo")).toBe(true);
    expect(mounted.view.state.doc.textContent).toBe("**Bolde** plain");
    expect(await runCommand(mounted, "edit.redo")).toBe(true);
    expect(mounted.view.state.doc.textContent).toBe("**Bolder** plain");
  });

  it("preserves native undo and redo after projection commit", async () => {
    const mounted = await mountEditor("**Bold** plain");

    enterProjection(mounted, "strong");
    typeText(mounted.view, "er");
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
    expect(await runCommand(mounted, "edit.undo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("**Bold** plain\n");
    expect(await runCommand(mounted, "edit.redo")).toBe(true);
    expect(mounted.getMarkdown()).toBe("**Bolder** plain\n");
  });
});
