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

const getPreviewClassNames = (mounted: MountedMilkdownEditor) =>
  Array.from(mounted.view.dom.querySelectorAll("[data-leafdown-preview]"), (node) =>
    node.className.split(" ").filter((name) => name !== "ProseMirror-widget"),
  );

const getSourceClassNames = (mounted: MountedMilkdownEditor, source: string) =>
  Array.from(mounted.view.dom.querySelectorAll("span"))
    .filter((node) => node.textContent === source)
    .map((node) => node.className.split(" "));

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

  // The character is what the run renders and the source beside it is syntax, so each takes the
  // other's styling: regular text against the marker the source reads as.
  it.each([
    {
      caret: 3,
      label: "on its own",
      preview: ["leafdown-source-projection__content"],
      source: "A &copy; b",
    },
    {
      caret: 2,
      label: "inside a marked fragment",
      preview: [
        "leafdown-source-projection__content",
        "leafdown-source-projection__content--strong",
      ],
      source: "**a&copy;b**",
    },
    {
      caret: 2,
      label: "inside a link label",
      preview: [
        "leafdown-source-projection__content",
        "leafdown-source-projection__content--link",
        "leafdown-source-projection__content--link-label",
      ],
      source: "[a&copy;b](x)",
    },
  ])("draws the character as content and its source as a marker $label", async (expected) => {
    const mounted = await mountProjectionEditor(expected.source);

    setTextSelection(mounted.view, expected.caret);

    expect(getPreviewClassNames(mounted)).toEqual([
      ["leafdown-source-projection__preview", ...expected.preview],
    ]);
    expect(getSourceClassNames(mounted, "&copy;")).toContainEqual(
      expect.arrayContaining(["leafdown-source-projection__marker"]),
    );
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

describe("typed character reference conversion", () => {
  it.each([
    { decoded: COPYRIGHT_SIGN, label: "a named reference", source: "&copy;" },
    { decoded: COPYRIGHT_SIGN, label: "a decimal reference", source: "&#169;" },
    { decoded: COPYRIGHT_SIGN, label: "a hexadecimal reference", source: "&#xA9;" },
    { decoded: "fj", label: "a reference naming two characters", source: "&fjlig;" },
    { decoded: NO_BREAK_SPACE, label: "a reference naming whitespace", source: "&nbsp;" },
  ])("converts $label as its terminator completes it", async ({ decoded, source }) => {
    const mounted = await mountProjectionEditor("A b");
    const caret = getEditorTextPosition(mounted, "b");

    setTextSelection(mounted.view, caret);
    typeText(mounted.view, source);

    expect(getProjectionAdapterId(mounted)).toBe("character-reference");
    expect(getEditorTextContent(mounted)).toBe(`A ${source}b`);
    expect(getMarkerTexts(mounted)).toEqual([source]);
    expect(getProjectedLineText(mounted)).toBe(`A [${decoded}]${source}b`);
    expect(mounted.view.state.selection.from).toBe(caret + source.length);
    expect(mounted.getMarkdown()).toBe(`A ${source}b\n`);
  });

  // The conversion is a restyle rather than a rewrite: the run holds the same characters the
  // keystroke put there, and the caret is where typing the terminator left it.
  it("leaves the typed characters and the caret where the terminator put them", async () => {
    const mounted = await mountProjectionEditor("");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "&copy");

    const beforeText = getEditorTextContent(mounted);
    const beforeCaret = mounted.view.state.selection.from;

    typeText(mounted.view, ";");

    expect(getEditorTextContent(mounted)).toBe(`${beforeText};`);
    expect(mounted.view.state.selection.from).toBe(beforeCaret + 1);
  });

  it("commits the reference when the caret leaves the converted run", async () => {
    const mounted = await mountProjectionEditor("A b");

    setTextSelection(mounted.view, getEditorTextPosition(mounted, "b"));
    typeText(mounted.view, "&copy;");
    setTextSelection(mounted.view, 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe(`A ${COPYRIGHT_SIGN}b`);
    expect(mounted.getMarkdown()).toBe("A &copy;b\n");
  });

  it("commits the reference when a character is typed against its right edge", async () => {
    const mounted = await mountProjectionEditor("");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "&copy;x");

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe(`${COPYRIGHT_SIGN}x`);
    expect(mounted.getMarkdown()).toBe("&copy;x\n");
  });

  // The escape is how an author keeps the characters they typed without reaching for `Undo`.
  it("commits literal text when the projected source is escaped", async () => {
    const mounted = await mountProjectionEditor("A b");
    const caret = getEditorTextPosition(mounted, "b");

    setTextSelection(mounted.view, caret);
    typeText(mounted.view, "&copy;");
    setTextSelection(mounted.view, caret);
    typeText(mounted.view, "\\");
    setTextSelection(mounted.view, 1);

    expect(getEditorTextContent(mounted)).toBe("A &copy;b");
    expect(mounted.getMarkdown()).toBe(`${String.raw`A \&copy;b`}\n`);
  });

  it.each([
    { label: "an unclosed reference", typed: "&copy" },
    { label: "a name no table holds", typed: "&MadeUpEntity;" },
    { label: "a numeric reference with no digits", typed: "&#;" },
  ])("leaves $label literal through a save and a reopen", async ({ typed }) => {
    const mounted = await mountProjectionEditor("");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, typed);
    setTextSelection(mounted.view, 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(mounted.getMarkdown()).toBe(`${typed}\n`);

    const reopened = await mountProjectionEditor(`${typed}\n`);

    expect(getEditorTextContent(reopened)).toBe(typed);
    expect(reopened.getMarkdown()).toBe(`${typed}\n`);
  });

  // A preserved reference stands for the character it will be written as, so the ampersand it
  // spells opens nothing, which is the rule its own escaping already follows.
  it("leaves a preserved reference inert to the terminator", async () => {
    const mounted = await mountProjectionEditor("a &amp;");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "copy;");
    setTextSelection(mounted.view, 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe("a &copy;");
    expect(mounted.getMarkdown()).toBe("a &amp;copy;\n");
  });

  it.each([
    {
      committed: "`a&copy;`",
      content: "a",
      label: "inside a code span",
      owner: "mark",
      source: "`a`",
    },
    {
      committed: String.raw`**a\&copy;b**`,
      content: "ab",
      label: "inside a marked fragment",
      owner: "mark",
      source: "**ab**",
    },
    {
      committed: "[a&copy;b](x)",
      content: "ab",
      label: "inside a link label",
      owner: "link",
      source: "[ab](x)",
    },
  ])("leaves the run to its owner $label", async ({ committed, content, owner, source }) => {
    const mounted = await mountProjectionEditor(source);

    setTextSelection(mounted.view, getEditorTextPosition(mounted, content) + 1);
    typeText(mounted.view, "&copy;");

    expect(getProjectionAdapterId(mounted)).toBe(owner);

    setTextSelection(mounted.view, 1);

    expect(mounted.getMarkdown()).toBe(`${committed}\n`);
  });

  it("leaves a run crossing a mark boundary as it was written", async () => {
    const mounted = await mountProjectionEditor("&co**py**");
    const caret = getEditorTextPosition(mounted, "py") + "py".length;

    setTextSelection(mounted.view, caret);
    typeText(mounted.view, ";");

    expect(getProjectionAdapterId(mounted)).toBe("mark");
    expect(getEditorTextContent(mounted)).toBe("&co**py;**");

    setTextSelection(mounted.view, 1);

    expect(mounted.getMarkdown()).toBe("&co**py;**\n");
  });

  // The conversion is not the typing that reached it, so it is a step of its own: one `Undo` steps
  // past the terminator rather than onto a run that differs only by marker colour.
  it("returns the typed source with one Undo", async () => {
    const mounted = await mountProjectionEditor("A b");
    const caret = getEditorTextPosition(mounted, "b");

    setTextSelection(mounted.view, caret);
    typeText(mounted.view, "&copy;");

    expect(await runEditorCommand(mounted.editor, "edit.undo")).toBe(true);
    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe("A &copyb");
    expect(mounted.getMarkdown()).toBe("A &copyb\n");

    expect(await runEditorCommand(mounted.editor, "edit.redo")).toBe(true);
    expect(getEditorTextContent(mounted)).toBe("A &copy;b");
    expect(getMarkerTexts(mounted)).toEqual(["&copy;"]);
  });

  // A backslash is a character the document holds rather than an escape it records, so one typed
  // before the run does not hold the conversion off. The escape that keeps the characters is the
  // one written into the projected source.
  it("converts a run a typed backslash stands before", async () => {
    const mounted = await mountProjectionEditor("");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, String.raw`\&copy;`);
    setTextSelection(mounted.view, 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe(`\\${COPYRIGHT_SIGN}`);
    expect(mounted.getMarkdown()).toBe(`${String.raw`\\&copy;`}\n`);
  });

  it("converts a reference typed against one already preserved", async () => {
    const mounted = await mountProjectionEditor("a &copy;");

    setSelectionAtDocumentEnd(mounted.view);
    typeText(mounted.view, "&reg;");
    setTextSelection(mounted.view, 1);

    expect(hasActiveSourceProjection(mounted.view.state)).toBe(false);
    expect(getEditorTextContent(mounted)).toBe(`a ${COPYRIGHT_SIGN}®`);
    expect(mounted.getMarkdown()).toBe("a &copy;&reg;\n");
  });

  it("reaches the document a plain-text paste of the same characters reaches", async () => {
    const typed = await mountProjectionEditor("");
    const pasted = await mountProjectionEditor("");

    setSelectionAtDocumentEnd(typed.view);
    typeText(typed.view, "A &copy; b");

    setSelectionAtDocumentEnd(pasted.view);
    dispatchClipboardEvent(pasted.view.dom, "paste", { [TEXT_PLAIN_MIME_TYPE]: "A &copy; b" });
    setTextSelection(pasted.view, 1);

    expect(typed.view.state.doc.toJSON()).toEqual(pasted.view.state.doc.toJSON());
    expect(typed.getMarkdown()).toBe("A &copy; b\n");
    expect(pasted.getMarkdown()).toBe("A &copy; b\n");
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
