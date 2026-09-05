// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import { TEXT_PLAIN_MIME_TYPE } from "@/lib/mime";
import { EDITOR_TEST_ROOT_CLASS_NAME } from "@/test/factories/editor";
import { createClipboardData, dispatchClipboardEvent } from "@/test/utils/events";
import { setupMilkdownEditorMount, type MountedMilkdownEditor } from "@/test/utils/milkdown";
import {
  getEditorTextContent,
  getEditorTextPosition,
  getSelectedEditorText,
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

const COPYRIGHT_SIGN = "©";
const NO_BREAK_SPACE = "\u00a0";
const ZERO_WIDTH_SPACE = "\u200b";

// The character a projected reference names is drawn from an attribute rather than written into
// the document, so the rendered line reads as the source with each preview marked where it stands.
const getProjectedLineText = (mounted: MountedMilkdownEditor) => {
  const read = (node: Node): string =>
    Array.from(node.childNodes, (child) => {
      if (!(child instanceof HTMLElement)) {
        return child.textContent ?? "";
      }

      const preview = child.dataset.leafdownPreview;

      return preview === undefined ? read(child) : `[${preview}]`;
    }).join("");

  return read(mounted.view.dom);
};

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

  it.each([
    ["a named reference", "A &copy; b", `A [${COPYRIGHT_SIGN}]&copy; b`],
    ["a decimal reference", "A &#169; b", `A [${COPYRIGHT_SIGN}]&#169; b`],
    ["a hexadecimal reference", "A &#xA9; b", `A [${COPYRIGHT_SIGN}]&#xA9; b`],
    ["a reference naming a space", "A &nbsp; b", `A [${NO_BREAK_SPACE}]&nbsp; b`],
    ["a reference naming nothing visible", "A &#8203; b", `A [${ZERO_WIDTH_SPACE}]&#8203; b`],
    ["a reference naming two characters", "A &fjlig; b", "A [fj]&fjlig; b"],
  ])("shows the character %s names beside its source", async (_label, source, projected) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, 3);

    expect(getProjectedLineText(mounted)).toBe(projected);
  });

  it("leaves the document, the caret, and the saved file unchanged by the preview", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");
    const renderedSize = mounted.view.state.doc.content.size;

    setTextSelection(mounted.view, 3);

    expect(getEditorTextContent(mounted)).toBe("A &copy; b");
    expect(mounted.view.state.selection.from).toBe(3);
    expect(mounted.view.state.doc.content.size).toBe(renderedSize + "&copy;".length - 1);

    setTextSelection(mounted.view, 1);

    expect(getProjectedLineText(mounted)).toBe(`A ${COPYRIGHT_SIGN} b`);
    expect(mounted.view.state.doc.content.size).toBe(renderedSize);
    expect(mounted.getMarkdown()).toBe("A &copy; b\n");
  });

  it("leaves the preview out of a selection over the source and out of a copy of it", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");
    const clipboardData = createClipboardData();

    setTextSelection(mounted.view, 3);
    setTextSelection(mounted.view, 3, 9);
    dispatchClipboardEvent(mounted.view.dom, "copy", clipboardData);

    expect(getSelectedEditorText(mounted)).toBe("&copy;");
    expect(clipboardData.getData(TEXT_PLAIN_MIME_TYPE)).toBe("&copy;");
  });

  it("drops the preview once an edit leaves the source spelling no reference", async () => {
    const mounted = await mountProjectionEditor("A &copy; b");

    setTextSelection(mounted.view, 4);
    pressBackspace(mounted);

    expect(getProjectedLineText(mounted)).toBe("A &copy b");
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

  it.each([
    {
      label: "repeat",
      marker: "&copy;",
      projected: "A &copy;© b",
      rendered: "A ©© b",
      source: "A &copy;&copy; b",
    },
    {
      label: "differ",
      marker: "&copy;",
      projected: "A &copy;® b",
      rendered: "A ©® b",
      source: "A &copy;&reg; b",
    },
    {
      label: "name more than one character",
      marker: "&fjlig;",
      projected: "A &fjlig;fj b",
      rendered: "A fjfj b",
      source: "A &fjlig;&fjlig; b",
    },
  ])(
    "projects the reference the caret reaches where two adjacent ones $label",
    async ({ marker, projected, rendered, source }) => {
      const mounted = await mountProjectionEditor(source);

      expect(getEditorTextContent(mounted)).toBe(rendered);

      setTextSelection(mounted.view, 3);

      expect(getProjectionAdapterId(mounted)).toBe("character-reference");
      expect(getEditorTextContent(mounted)).toBe(projected);
      expect(getMarkerTexts(mounted)).toEqual([marker]);
    },
  );

  it("enters the reference that follows a position between two", async () => {
    const mounted = await mountProjectionEditor("A &copy;&copy; b");

    setTextSelection(mounted.view, 4);

    expect(getEditorTextContent(mounted)).toBe("A ©&copy; b");
    expect(mounted.view.state.selection.from).toBe(4);
  });

  it("enters the last reference of a run from the right", async () => {
    const mounted = await mountProjectionEditor("A &copy;&copy; b");

    setTextSelection(mounted.view, 5);

    expect(getEditorTextContent(mounted)).toBe("A ©&copy; b");
    expect(mounted.view.state.selection.from).toBe(10);
  });

  it("commits one reference of a run an edit rewrites", async () => {
    const mounted = await mountProjectionEditor("A &copy;&copy; b");

    setTextSelection(mounted.view, 3);
    setTextSelection(mounted.view, 4, 8);
    typeText(mounted.view, "#169");
    setTextSelection(mounted.view, 1);

    expect(getEditorTextContent(mounted)).toBe("A ©© b");
    expect(mounted.getMarkdown()).toBe("A &#169;&copy; b\n");
  });

  it.each([
    { committed: "A &copy&copy; b", label: "a repeat of it", source: "A &copy;&copy; b" },
    { committed: "A &copy&reg; b", label: "a different reference", source: "A &copy;&reg; b" },
  ])(
    "leaves $label preserved when the reference before it is broken",
    async ({ committed, source }) => {
      const mounted = await mountProjectionEditor(source);

      setTextSelection(mounted.view, 3);
      setTextSelection(mounted.view, 9);
      pressBackspace(mounted);
      setTextSelection(mounted.view, 1);

      expect(mounted.getMarkdown()).toBe(`${committed}\n`);
    },
  );

  // Deleting the text between two identical references makes their marks neighbours, which merges
  // them into one node the same way the parser's own runs arrive merged.
  it("keeps both references when an edit brings two identical ones together", async () => {
    const mounted = await mountProjectionEditor("A &copy;x&copy; b");

    setTextSelection(mounted.view, 4, 5);
    pressBackspace(mounted);
    setSelectionAtDocumentEnd(mounted.view);

    expect(getEditorTextContent(mounted)).toBe("A ©© b");
    expect(mounted.getMarkdown()).toBe("A &copy;&copy; b\n");
  });

  // A selection that ends inside the characters a reference names is not contained by it, so the
  // deletion is an ordinary one and leaves the stored source describing text that is gone.
  it("projects nothing where the stored source no longer spells the text it covers", async () => {
    const mounted = await mountProjectionEditor("A &fjlig; b");

    setTextSelection(mounted.view, 1, 4);
    pressBackspace(mounted);
    setTextSelection(mounted.view, 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe("j b");
    expect(mounted.getMarkdown()).toBe("j b\n");
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
    {
      caret: 2,
      label: "a marked fragment",
      projected: `**a[${COPYRIGHT_SIGN}]&copy;b**`,
      source: "**a&copy;b**",
    },
    {
      caret: 2,
      label: "a link label",
      projected: `[a[${COPYRIGHT_SIGN}]&copy;b](x)`,
      source: "[a&copy;b](x)",
    },
    {
      caret: 4,
      label: "a link label inside a marked fragment",
      projected: `**[a[${COPYRIGHT_SIGN}]&copy;b](x)**`,
      source: "**[a&copy;b](x)**",
    },
    {
      caret: 2,
      label: "a fragment the references open and close",
      projected: `**[${COPYRIGHT_SIGN}]&copy;a[®]&reg;**`,
      source: "**&copy;a&reg;**",
    },
  ])("shows the character a reference in $label names", async ({ caret, projected, source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, caret);

    expect(getEditorTextContent(mounted)).toBe(source);
    expect(getProjectedLineText(mounted)).toBe(projected);
  });

  it.each([
    { caret: 2, label: "a marked fragment", source: "**a&copy;b**" },
    { caret: 2, label: "a link label", source: "[a&copy;b](x)" },
  ])("leaves the file $label writes unchanged by the preview", async ({ caret, source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, caret);
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe(`${source}\n`);
  });

  // A code span keeps its content literal, so the characters a reference would name are the text
  // the file already holds and there is nothing beside the source to preview. An escape spends a
  // backslash on the ampersand for the same reason.
  it.each([
    { label: "a code span", source: "[a`&copy;`b](x)" },
    { label: "an escape", source: String.raw`[a\&copy;b](x)` },
  ])(
    "shows no preview where $label keeps a reference in a link label literal",
    async ({ source }) => {
      const mounted = await mountProjectionEditor(source);

      setTextSelection(mounted.view, 2);

      expect(getEditorTextContent(mounted)).toBe(source);
      expect(getProjectedLineText(mounted)).toBe(source);
    },
  );

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

  it.each([
    { adapter: "mark", caret: 1, label: "opens the fragment", source: "**&nbsp;a**" },
    { adapter: "mark", caret: 2, label: "closes the fragment", source: "**a&nbsp;**" },
    { adapter: "mark", caret: 1, label: "is the whole fragment", source: "**&nbsp;**" },
    { adapter: "link", caret: 1, label: "opens a link label", source: "[&nbsp;a](x)" },
  ])(
    "projects the complete source where a reference naming whitespace $label",
    async ({ adapter, caret, source }) => {
      const mounted = await mountProjectionEditor(source);

      setTextSelection(mounted.view, caret);

      expect(getProjectionAdapterId(mounted)).toBe(adapter);
      expect(getEditorTextContent(mounted)).toBe(source);
    },
  );

  it("restores the owner unchanged when nothing is edited", async () => {
    const mounted = await mountProjectionEditor("**a&copy;b** [c&copy;d](x)");

    setTextSelection(mounted.view, 2);
    setSelectionAtDocumentEnd(mounted.view);

    expect(mounted.getMarkdown()).toBe("**a&copy;b** [c&copy;d](x)\n");
  });
});
