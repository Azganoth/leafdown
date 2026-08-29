import { describe, expect, it } from "vitest";

import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  runKeyDownHandlers,
  setSelectionAtDocumentEnd,
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

describe("character reference source projection under an owner", () => {
  it.each([
    { adapter: "mark", caret: 2, label: "bold", source: "**a&copy;b**" },
    { adapter: "mark", caret: 3, label: "bold past the reference", source: "**a&copy;b**" },
    { adapter: "mark", caret: 2, label: "italic", source: "*a&copy;b*" },
    { adapter: "mark", caret: 2, label: "strikethrough", source: "~~a&copy;b~~" },
    { adapter: "mark", caret: 1, label: "a fragment the reference opens", source: "**&copy;b**" },
    { adapter: "mark", caret: 3, label: "a fragment the reference closes", source: "**a&copy;**" },
    { adapter: "link", caret: 2, label: "a link label", source: "[a&copy;b](x)" },
    {
      adapter: "link",
      caret: 4,
      label: "a link label past the reference",
      source: "[a&copy;b](x)",
    },
  ])("projects the complete source of $label", async ({ adapter, caret, source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, caret);

    expect(getProjectionAdapterId(mounted)).toBe(adapter);
    expect(getEditorTextContent(mounted)).toBe(source);
  });

  it.each([
    { adapter: "mark", label: "a marked fragment", source: "**a&copy;b**" },
    { adapter: "link", label: "a link label", source: "[a&copy;b](x)" },
  ])("projects $label a selection is contained in", async ({ adapter, source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, 1, 4);

    expect(getProjectionAdapterId(mounted)).toBe(adapter);
    expect(getEditorTextContent(mounted)).toBe(source);
  });

  it.each([
    {
      committed: "**aX&copy;b**",
      label: "before the reference",
      owner: "strong",
      rendered: "aX©b",
      source: "**a&copy;b**",
      target: "a",
    },
    {
      committed: "**a&copy;bX**",
      label: "after the reference",
      owner: "strong",
      rendered: "a©bX",
      source: "**a&copy;b**",
      target: "b",
    },
    {
      committed: "[aX&copy;b](x)",
      label: "inside a link label",
      owner: "a",
      rendered: "aX©b",
      source: "[a&copy;b](x)",
      target: "a",
    },
  ])(
    "commits one owner with the reference intact for an edit $label",
    async ({ committed, owner, rendered, source, target }) => {
      const mounted = await mountProjectionEditor(source);

      setTextSelection(mounted.view, 1);
      setTextSelection(mounted.view, getEditorTextPosition(mounted, target) + target.length);
      typeText(mounted.view, "X");
      setSelectionAtDocumentEnd(mounted.view);

      expect(mounted.getMarkdown()).toBe(`${committed}\n`);
      expect(getEditorTextContent(mounted)).toBe(rendered);
      expect(mounted.view.dom.querySelector(owner)).toHaveTextContent(rendered);
    },
  );

  it("restores the owner unchanged when nothing is edited", async () => {
    const mounted = await mountProjectionEditor("**a&copy;b** [c&copy;d](x)");

    setTextSelection(mounted.view, 2);
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("**a&copy;b** [c&copy;d](x)\n");
  });
});
