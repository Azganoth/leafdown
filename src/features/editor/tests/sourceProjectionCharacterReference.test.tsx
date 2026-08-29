import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
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

const getProjectionAdapterId = (mounted: MountedMilkdownEditor) =>
  leafdownSourceProjectionPluginKey.getState(mounted.view.state)?.session?.adapter.id ?? null;

const getMarkerTexts = (mounted: MountedMilkdownEditor) =>
  Array.from(
    mounted.view.dom.querySelectorAll(".leafdown-source-projection__marker"),
    (node) => node.textContent,
  );

const pressBackspace = (mounted: MountedMilkdownEditor) => {
  runKeyDownHandlers(mounted.view, "Backspace");
};

describe("character reference source projection", () => {
  it.each([
    ["a named reference", "A &copy; b"],
    ["a decimal reference", "A &#169; b"],
    ["a hexadecimal reference", "A &#xA9; b"],
  ])("projects %s as the file holds it", async (_label, source) => {
    const mounted = await mountProjectionEditor(source);

    expect(getEditorTextContent(mounted)).toBe("A © b");

    setTextSelection(mounted.view, 3);

    expect(getProjectionAdapterId(mounted)).toBe("character-reference");
    expect(getEditorTextContent(mounted)).toBe(source);
    expect(getMarkerTexts(mounted)).toEqual([source.slice(2, -2)]);
  });

  it("starts at the beginning of the source entering from the left", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 3);

    expect(mounted.view.state.selection.from).toBe(3);
  });

  it("starts at the end of the source entering from the right", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 4);

    expect(mounted.view.state.selection.from).toBe(9);
  });

  it("projects the source a selection over the rendered character covers", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 3, 4);

    expect(getEditorTextContent(mounted)).toBe("A &copy; b");
    expect(mounted.view.state.selection.anchor).toBe(3);
    expect(mounted.view.state.selection.head).toBe(9);
  });

  it("leaves a selection reaching past the reference unprojected", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 1, 4);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe("A © b");
  });

  it("restores the rendered character when the caret leaves the source alone", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 3);
    setTextSelection(mounted.view, 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe("A © b");
    expect(mounted.getMarkdown()).toBe("A &copy; b\n");
  });

  it("commits the literal text the source spells when a character is removed", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 4);
    pressBackspace(mounted);
    setTextSelection(mounted.view, 1);

    expect(getEditorTextContent(mounted)).toBe("A &copy b");
    expect(mounted.getMarkdown()).toBe("A &copy b\n");
  });

  it("reverses the removal with Undo", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 4);
    pressBackspace(mounted);
    setTextSelection(mounted.view, 1);

    await runEditorCommand(mounted.editor, "edit.undo");
    setTextSelection(mounted.view, 1);

    expect(getEditorTextContent(mounted)).toBe("A © b");
    expect(mounted.getMarkdown()).toBe("A &copy; b\n");
  });

  it("commits the reference an edit rewrites into another form", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 3);
    setTextSelection(mounted.view, 4, 8);
    typeText(mounted.view, "#169");
    setTextSelection(mounted.view, 1);

    expect(getEditorTextContent(mounted)).toBe("A © b");
    expect(mounted.getMarkdown()).toBe("A &#169; b\n");
  });

  it("keeps the reference when a character is typed against its right edge", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 4);
    typeText(mounted.view, "x");
    setTextSelection(mounted.view, 1);

    expect(getEditorTextContent(mounted)).toBe("A ©x b");
    expect(mounted.getMarkdown()).toBe("A &copy;x b\n");
  });

  it("writes the literal text when the document is saved with the source open", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 4);
    setTextSelection(mounted.view, 7);
    pressBackspace(mounted);

    expect(mounted.getMarkdown()).toBe("A &coy; b\n");
    expect(getEditorTextContent(mounted)).toBe("A &coy; b");
  });

  it("projects nothing where the stored source no longer spells the text it covers", async () => {
    const mounted = await mountProjectionEditor("A &copy;&copy; b");

    setTextSelection(mounted.view, 3);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe("A ©© b");
  });
});
